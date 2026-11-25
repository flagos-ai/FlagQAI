"""Run each catalog notebook in an independent process, with at most two kernels.

The coordinator alone writes the common ledger. Every child retains its own
unchanged sources, database, executed notebook and artifacts. Prior failed
attempts are never overwritten. No model or provider calls are made.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
import fcntl
import json
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.runtime_facts import runtime_manifest


def write(path, value):
    pending = path.with_suffix('.pending')
    pending.write_text(json.dumps(value, indent=2) + '\n')
    pending.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report-root', required=True, type=Path)
    parser.add_argument('--workers', type=int, default=2, choices=(1, 2))
    parser.add_argument('--cpu-threads', type=int, default=4)
    parser.add_argument('--cell-timeout', type=int, default=1800)
    parser.add_argument('--notebook-timeout', type=int, default=7200)
    parser.add_argument('--only', action='append')
    args = parser.parse_args()
    if not 1 <= args.cpu_threads <= 64 or not 1 <= args.cell_timeout <= 7200:
        parser.error('Use 1..64 CPU threads and a 1..7200 second cell timeout.')
    root = args.report_root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    lock = (root / '.audit.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    web = Path(__file__).resolve().parents[3] / 'apps/web/public'
    catalog = json.loads((web / 'notebooks/catalog.json').read_text())
    import flagquantum as fq
    facts = runtime_manifest(fq)
    if not facts.get('native_cpu', {}).get('available'):
        raise RuntimeError('Complete the native CPU SDK build before final corpus acceptance.')
    environment = root / 'runtime-environment.json'
    if environment.exists():
        old = json.loads(environment.read_text())
        if any(old.get(k) != facts.get(k) for k in ('python', 'packages', 'sdk_code_sha256')):
            raise RuntimeError('Runtime changed; use a new report root.')
    else:
        write(environment, facts)
    write(root / 'external-inputs.json', json.loads((web / 'examples/synthesis-inputs/manifest.json').read_text()))
    ledger_path = root / 'ledger.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {
        'schema': 'flagqai.notebook-corpus-acceptance.v1', 'catalog_revision': catalog['revision'],
        'python': sys.executable, 'source_modified': False, 'model_calls': 0,
        'max_independent_kernels': args.workers, 'attempts': []}
    if ledger['catalog_revision'] != catalog['revision']:
        raise RuntimeError('Catalog changed; use a new report root.')
    todo = []
    for item in catalog['entries']:
        if args.only and not any(value == item['id'] or value in item['path'] for value in args.only):
            continue
        previous = [a for a in ledger['attempts'] if a['notebook_id'] == item['id']]
        if previous and previous[-1]['notebook_sha256'] != item['notebookSha256']:
            raise RuntimeError('Notebook changed; use a new report root.')
        if not previous or previous[-1]['status'] != 'completed':
            todo.append(item)
    child_script = Path(__file__).with_name('notebook_corpus_acceptance.py')

    def execute(item, outer):
        with (outer / 'worker.log').open('w') as output:
            process = subprocess.run([sys.executable, str(child_script), '--report-root', str(outer),
                '--only', item['id'], '--cpu-threads', str(args.cpu_threads),
                '--cell-timeout', str(args.cell_timeout), '--notebook-timeout', str(args.notebook_timeout)],
                stdout=output, stderr=subprocess.STDOUT)
        child = json.loads((outer / 'ledger.json').read_text())
        records = [a for a in child['attempts'] if a['notebook_id'] == item['id']]
        if len(records) != 1:
            raise RuntimeError('Child did not produce exactly one independent notebook receipt.')
        return records[0], process.returncode

    active = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        while todo or active:
            while todo and len(active) < args.workers:
                item = todo.pop(0)
                number = 1 + sum(a['notebook_id'] == item['id'] for a in ledger['attempts'])
                outer = root / item['id'] / ('dispatch-' + str(number))
                outer.mkdir(parents=True, exist_ok=False)
                row = {'notebook_id': item['id'], 'path': item['path'], 'notebook_sha256': item['notebookSha256'],
                       'attempt': number, 'status': 'running', 'started_at': time.time(),
                       'directory': str((outer / item['id'] / 'attempt-1').relative_to(root)),
                       'cpu_threads': args.cpu_threads, 'cell_timeout_seconds': args.cell_timeout,
                       'notebook_timeout_seconds': args.notebook_timeout}
                ledger['attempts'].append(row)
                write(ledger_path, ledger)
                future = pool.submit(execute, item, outer)
                active[future] = (row, outer)
                print('START ' + item['path'], flush=True)
            settled, _ = wait(active, timeout=1, return_when=FIRST_COMPLETED)
            for future in settled:
                row, outer = active.pop(future)
                number = row['attempt']
                try:
                    result, exit_code = future.result()
                    result['directory'] = str((outer / result['directory']).relative_to(root))
                    row.update(result, attempt=number, worker_exit_code=exit_code)
                except Exception as error:
                    row.update(status='failed', error=type(error).__name__ + ': ' + str(error),
                               elapsed_seconds=round(time.time() - row['started_at'], 3))
                write(ledger_path, ledger)
                latest = {a['notebook_id']: a for a in ledger['attempts']}
                complete = sum(a['status'] == 'completed' for a in latest.values())
                print(f"{complete}/{len(catalog['entries'])} {row['status'].upper()} {row['path']} ({row.get('elapsed_seconds')}s)", flush=True)
    latest = {a['notebook_id']: a for a in ledger['attempts']}
    return 0 if len(latest) == len(catalog['entries']) and all(a['status'] == 'completed' for a in latest.values()) else 1


if __name__ == '__main__':
    sys.exit(main())
