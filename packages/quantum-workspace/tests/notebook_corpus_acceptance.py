"""Execute unchanged catalog notebooks sequentially through the real Web kernel.

Each attempt has an independent database, kernel, outputs and artifact directory.
No model calls. --report-root resumes a ledger and skips only completed notebooks;
--retry-failed starts fresh attempts while preserving every previous failure.
"""
import argparse
import copy
import fcntl
from hashlib import sha256
import json
from pathlib import Path
import sys
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from flagquantum_adapter.local_cpu import LocalCPUAdapter
from workspace_server.config import WorkspaceSettings
from workspace_server.job_store import SQLiteJobStore
from workspace_server.notebook_sessions import NotebookSessions
from workspace_server.python_runs import PythonRuns
from workspace_server.service import QuantumWorkspaceService


def write(path, data):
    temporary = path.with_suffix('.pending')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report-root', type=Path, required=True)
    parser.add_argument('--only', action='append')
    parser.add_argument('--retry-failed', action='store_true')
    parser.add_argument('--cpu-threads', type=int, default=2)
    parser.add_argument('--cell-timeout', type=int, default=600)
    parser.add_argument('--notebook-timeout', type=int, default=1800)
    parser.add_argument('--memory-limit-mib', type=int, default=4096)
    args = parser.parse_args()
    if not 1 <= args.cpu_threads <= 64 or not 1 <= args.cell_timeout <= 7200 or args.notebook_timeout < 1 or args.memory_limit_mib < 1:
        parser.error('Use a cell timeout of 1..7200 seconds and positive notebook/memory budgets.')
    root = args.report_root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    audit_lock = (root / '.audit.lock').open('a')
    try:
        fcntl.flock(audit_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise RuntimeError('This audit ledger is already running; no duplicate execution was started.')
    web = Path(__file__).resolve().parents[3] / 'apps/web/public'
    catalog = json.loads((web / 'notebooks/catalog.json').read_text())
    ledger = root / 'ledger.json'
    report = json.loads(ledger.read_text()) if ledger.exists() else {
        'schema': 'flagqai.notebook-corpus-acceptance.v1', 'catalog_revision': catalog['revision'],
        'python': sys.executable, 'source_modified': False, 'model_calls': 0, 'attempts': []}
    if report['catalog_revision'] != catalog['revision']:
        raise ValueError('Catalog revision differs from this audit ledger.')
    try:
        import psutil
    except ImportError:
        psutil = None
    from workspace_server.runtime_facts import runtime_manifest
    import flagquantum as fq
    facts = runtime_manifest(fq)
    environment_file = root / 'runtime-environment.json'
    if environment_file.exists():
        frozen = json.loads(environment_file.read_text())
        if any(frozen.get(key) != facts.get(key) for key in ('python', 'packages', 'sdk_code_sha256')):
            raise RuntimeError('Compute environment changed; start a new audit ledger to avoid mixing verification evidence.')
    else:
        write(environment_file, facts)
    for index, item in enumerate(catalog['entries']):
        if args.only and not any(value == item['id'] or value in item['path'] for value in args.only):
            continue
        previous = [r for r in report['attempts'] if r['notebook_id'] == item['id']]
        if previous and previous[-1]['notebook_sha256'] != item['notebookSha256']:
            raise RuntimeError('Original notebook source changed; start a new audit ledger.')
        if previous and (previous[-1]['status'] == 'completed' or not args.retry_failed):
            continue
        attempt = root / item['id'] / ('attempt-' + str(len(previous) + 1))
        attempt.mkdir(parents=True, exist_ok=False)
        record = {'notebook_id': item['id'], 'path': item['path'], 'notebook_sha256': item['notebookSha256'],
                  'attempt': len(previous) + 1, 'status': 'running', 'started_at': time.time(),
                  'directory': str(attempt.relative_to(root)), 'cell_timeout_seconds': args.cell_timeout, 'cpu_threads': args.cpu_threads}
        report['attempts'].append(record)
        write(ledger, report)
        print(f"[{index+1}/{len(catalog['entries'])}] START {item['path']}", flush=True)
        settings = WorkspaceSettings(web, attempt / 'jobs.sqlite3', agent_cwd=attempt,
            compute_transport='local', local_python=sys.executable, experiment_python=sys.executable,
            notebook_cell_timeout_seconds=args.cell_timeout, notebook_cpu_threads=args.cpu_threads)
        store = SQLiteJobStore(settings.database_path)
        store.initialize()
        quantum = QuantumWorkspaceService(store, LocalCPUAdapter(sys.executable))
        python = PythonRuns(settings, quantum)
        sessions = NotebookSessions(settings, python)
        key = uuid.uuid4().hex
        original = json.loads((web / 'notebooks' / (item['id'] + '.ipynb')).read_text())
        request = None
        try:
            doc = sessions.create({'notebook_id': item['id'], 'request_id': key})
            assert [c['source'] for c in doc['cells']] == [''.join(c['source']) for c in original['cells']]
            request = uuid.uuid4().hex
            ids = [c['id'] for c in doc['cells'] if c['cell_type'] == 'code']
            sessions.execute(key, {'request_id': request, 'revision': doc['revision'], 'cell_ids': ids})
            last_update = 0
            while True:
                run = sessions.runs.get(request)
                if run and run['status'] not in ('queued', 'running'):
                    break
                elapsed = time.time() - record['started_at']
                if elapsed > args.notebook_timeout:
                    raise TimeoutError('Notebook audit deadline exceeded; no cells were replayed.')
                if psutil:
                    try:
                        kernel = sessions.kernels.get(key)
                        rss = (sum(p.memory_info().rss for p in psutil.Process(kernel['process'].pid).children(recursive=True))
                               if kernel else 0)
                        if rss > args.memory_limit_mib * 1024**2:
                            raise MemoryError('Kernel exceeded the explicit audit memory budget.')
                    except psutil.NoSuchProcess:
                        pass
                if elapsed - last_update > 30:
                    print(f"  {int(elapsed)}s {sum(c['status']=='completed' for c in run['cells'])}/{len(ids)} cells", flush=True)
                    last_update = elapsed
                time.sleep(.5)
            write(attempt / 'run.json', run)
            if run['status'] == 'completed' and any(cell['status'] != 'completed' for cell in run['cells']):
                raise RuntimeError('Notebook receipt ended before all original code cells completed.')
            by_id = {c['id']: c for c in run['cells']}
            executed = copy.deepcopy(original)
            for cell, source in zip(executed['cells'], doc['cells']):
                if cell['cell_type'] == 'code':
                    observed = by_id[source['id']]
                    cell['outputs'] = observed['outputs']
                    cell['execution_count'] = observed.get('execution_count')
            write(attempt / 'executed.ipynb', executed)
            failed = [c for c in run['cells'] if c['status'] in ('failed', 'interrupted')]
            record.update(status=run['status'], code_cells=len(ids),
                completed_cells=sum(c['status'] == 'completed' for c in run['cells']),
                error=run.get('error'), failures=[{'index': next(i for i,c in enumerate(doc['cells']) if c['id']==bad['id']),
                    'source': bad['source'], 'errors': [o for o in bad['outputs'] if o['output_type']=='error']} for bad in failed])
        except Exception as error:
            partial = sessions.runs.get(request) if request else None
            if partial:
                write(attempt / 'interrupted-run.json', partial)
            record.update(status='failed', error=type(error).__name__ + ': ' + str(error))
        finally:
            sessions.close()
            python.close()
            quantum.close()
            record['elapsed_seconds'] = round(time.time() - record['started_at'], 3)
            artifacts = []
            for path in attempt.rglob('*'):
                if path.is_file() and path.suffix.lower() in ('.png', '.fqx', '.csv', '.ipynb', '.pth', '.pt', '.npy', '.npz'):
                    raw = path.read_bytes()
                    artifacts.append({'path': str(path.relative_to(attempt)), 'bytes': len(raw), 'sha256': sha256(raw).hexdigest()})
            record['artifacts'] = artifacts
            write(attempt / 'result.json', record)
            write(ledger, report)
            print(f"[{index+1}/{len(catalog['entries'])}] {record['status'].upper()} {item['path']} ({record['elapsed_seconds']}s)", flush=True)
    latest = {r['notebook_id']:r for r in report['attempts']}
    required = [item['id'] for item in catalog['entries'] if not args.only or any(value == item['id'] or value in item['path'] for value in args.only)]
    print(json.dumps({'notebooks': len(latest), 'completed': sum(r['status']=='completed' for r in latest.values()), 'ledger': str(ledger)}), flush=True)
    return 0 if required and all(identity in latest and latest[identity]['status']=='completed' for identity in required) else 1


if __name__ == '__main__':
    sys.exit(main())
