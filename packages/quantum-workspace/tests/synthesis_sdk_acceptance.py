"""Explicit source-tree SDK acceptance without model calls or user workspace writes.

Run with the desired compute interpreter. The default executes six representative
research entrypoints and one large helper module. --environment-only checks all
432 main-entry import/API closures without executing research. --all-entrypoints
performs an expensive fresh execution audit; each task retains the Web's 90s limit.
A successful import probe is never reported as workflow execution or correctness.
"""
import argparse
import ast
import base64
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from flagquantum_adapter.local_cpu import LocalCPUAdapter
from workspace_server.config import WorkspaceSettings
from workspace_server.job_store import SQLiteJobStore
from workspace_server.notebook_environment import PROBE, requirements
from workspace_server.python_runs import PythonRuns
from workspace_server.service import QuantumWorkspaceService
from workspace_server.synthesis_files import snapshot

DEFAULT_ENTRIES = (
    'community/basic_examples/superposition/main.py',
    'algorithms/quantum_linear_solvers/hhl/main.py',
    'algorithms/state_preparation/swap_test/main.py',
    'applications/automotive/cooling_systems_optimization/overview/main.py',
    'algorithms/search_and_optimization/qaoa/overview/main.py',
    'applications/chemistry/molecule_eigensolver/overview/main.py',
    'applications/physical_systems/hhl_lanchester/physics.py',
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment-only', action='store_true')
    parser.add_argument('--all-entrypoints', action='store_true')
    parser.add_argument('--entry', action='append')
    args = parser.parse_args()
    web = Path(__file__).resolve().parents[3] / 'apps/web/public'
    manifest = json.loads((web / 'examples/synthesis-files.json').read_text())
    indexed = {item['path']: item for item in manifest['entries']}
    first = indexed[DEFAULT_ENTRIES[0]]
    raw, _ = snapshot(web, first['path'], (web / first['url'].lstrip('/')).read_text())
    assets = json.loads(raw)['synthesis_files']
    files = {name: base64.b64decode(content).decode() for name, content in assets.items() if name.endswith('.py')}
    for name, source in files.items():
        ast.parse(source, filename=name)
    closures = {name: requirements(files, name) for name in files if name.endswith('/main.py')}
    combined = {'modules': sorted({module for value in closures.values() for module in value['modules']}),
                'symbols': sorted({tuple(symbol) for value in closures.values() for symbol in value['symbols']})}
    facts = (Path(__file__).resolve().parents[1] / 'local/workspace_server/runtime_facts.py').read_text()
    probe = subprocess.run([sys.executable, '-c', facts + '\nREQUIREMENTS = ' + repr(combined) + '\n' + PROBE],
                           capture_output=True, text=True, timeout=90)
    if probe.returncode:
        raise RuntimeError(probe.stderr[-2000:])
    observed = json.loads(probe.stdout.strip().splitlines()[-1])
    report = {'schema': 'flagqai.synthesis-execution-acceptance.v1', 'revision': manifest['revision'],
              'upstream_files_checked': len(indexed), 'upstream_python_parsed': sum(name.endswith('.py') for name in indexed),
              'entrypoint_environments_checked': len(closures), 'environment': observed, 'runs': [],
              'scope': 'Real execution is recorded only in runs. Helper imports, API probes and successful exits do not establish scientific correctness. No model calls.'}
    selected = [] if args.environment_only else args.entry or (
        [name[len('examples/synthesis/'):] for name in closures] if args.all_entrypoints else DEFAULT_ENTRIES)
    failed = bool(observed['missing_dependencies'] or observed['incompatible_sdk'])
    for entry in selected:
        item = indexed[entry]
        with tempfile.TemporaryDirectory(prefix='flagqai-synthesis-acceptance-') as folder:
            root = Path(folder)
            settings = WorkspaceSettings(web, root / 'jobs.sqlite3', agent_cwd=root,
                                         compute_transport='local', local_python=sys.executable, experiment_python=sys.executable)
            store = SQLiteJobStore(settings.database_path)
            store.initialize()
            quantum = QuantumWorkspaceService(store, LocalCPUAdapter(sys.executable))
            runs = PythonRuns(settings, quantum)
            try:
                run = runs.submit({'source': (web / item['url'].lstrip('/')).read_text(), 'name': entry, 'synthesis_path': entry})
                deadline = time.monotonic() + 150
                while time.monotonic() < deadline:
                    result = runs.get(run['id'])
                    if result['status'] not in ('queued', 'running'):
                        break
                    time.sleep(.1)
                if result['status'] in ('queued', 'running'):
                    runs.cancel(run['id'])
                evidence = runs.evidence(run['id'])
                assert sha256(evidence['inputs']['files'][evidence['inputs']['entry']].encode()).hexdigest() == result['source_hash']
                record = {'entry': entry, 'source_sha256': result['source_hash'], 'status': result['status'],
                          'elapsed_seconds': result.get('elapsed_seconds'), 'error': result.get('error'),
                          'logs': result['logs'], 'snapshot': result['synthesis']}
                report['runs'].append(record)
                failed |= result['status'] != 'completed'
                print(entry + ': ' + result['status'], file=sys.stderr, flush=True)
            finally:
                runs.close()
                quantum.close()
    print(json.dumps(report, indent=2))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
