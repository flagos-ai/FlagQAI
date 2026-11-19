"""Explicit local SDK acceptance. No model calls or user workspace writes.

Run with the pinned FlagQuantum checkout and its dependencies on PYTHONPATH.
The report goes to stdout; all projects, jobs and artifacts use a temporary root.
"""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from flagquantum_adapter.local_cpu import LocalCPUAdapter
from workspace_server.config import WorkspaceSettings
from workspace_server.job_store import SQLiteJobStore
from workspace_server.notebooks import create_notebook_project
from workspace_server.python_runs import PythonRuns
from workspace_server.service import QuantumWorkspaceService


WORKFLOWS = (
    'community/basic_examples/superposition',
    'algorithms/search_and_optimization/qaoa/overview',
    'applications/chemistry/molecule_eigensolver/overview',
)


def main():
    import flagquantum as fq
    import torch

    web = Path(__file__).resolve().parents[3] / 'apps/web/public'
    catalog = json.loads((web / 'notebooks/catalog.json').read_text())
    report = {'source_revision': catalog['revision'], 'sdk_version': fq.__version__, 'workflows': []}
    for slug in WORKFLOWS:
        with tempfile.TemporaryDirectory(prefix='flagqai-notebook-acceptance-') as folder:
            root = Path(folder)
            settings = WorkspaceSettings(web, root / 'jobs.sqlite3', agent_cwd=root,
                compute_transport='local', local_python=sys.executable, experiment_python=sys.executable)
            store = SQLiteJobStore(settings.database_path)
            store.initialize()
            quantum = QuantumWorkspaceService(store, LocalCPUAdapter(sys.executable))
            runs = PythonRuns(settings, quantum)
            try:
                item = next(item for item in catalog['entries'] if item['path'] == slug)
                copy = create_notebook_project(runs.projects, web, item['id'], 'a' * 32)
                retry = create_notebook_project(runs.projects, web, item['id'], 'a' * 32)
                assert copy['project']['id'] == retry['project']['id']
                assert len(runs.projects.list()['projects']) == 1
                assert not runs.store.list(), 'Creating a copy must not execute Python'
                run = runs.submit_project({'project_id': copy['project']['id'],
                    'entry': copy['file']['path'], 'expected_revision': copy['file']['revision']})
                deadline = time.monotonic() + 150
                while time.monotonic() < deadline:
                    result = runs.get(run['id'])
                    if result['status'] not in ('queued', 'running'):
                        break
                    time.sleep(0.1)
                assert result['status'] == 'completed', result
                assert result['collection_status'] == 'completed', result
                saved = next(item for item in result['experiments']
                             if item['filename'] == 'last-observed-run.fqx')
                archive = runs.experiments.file(saved['id'])
                assert hashlib.sha256(archive.read_bytes()).hexdigest() == saved['sha256']
                loaded = fq.load(str(archive))
                replay = fq.run(loaded.program)
                torch.testing.assert_close(replay.statevector(), loaded.result.statevector(), atol=1e-10, rtol=0)
                assert len(runs.store.list()) == 1
                report['workflows'].append({'path': slug, 'status': result['status'],
                    'notebook_sha256': item['notebookSha256'], 'bundle_sha256': item['bundleSha256'],
                    'project_hash': result['project']['disk_hash'],
                    'elapsed_seconds': result['elapsed_seconds'], 'saved_circuit_replay': True,
                    'stdout': ''.join(log['text'] for log in result['logs'] if log['stream'] == 'stdout')})
            finally:
                runs.close()
                quantum.close()
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
