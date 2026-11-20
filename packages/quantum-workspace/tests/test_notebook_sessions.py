"""Real IPython cells preserve state without replaying a notebook on recovery."""
import json
from pathlib import Path
import tempfile
import time
import unittest

from workspace_server.config import WorkspaceSettings
from workspace_server.notebook_sessions import NotebookSessions
from workspace_server.projects import ProjectConflict
from workspace_server.python_runs import PythonRuns
from workspace_server.job_store import SQLiteJobStore
from workspace_server.service import QuantumWorkspaceService
from flagquantum_adapter.local_cpu import LocalCPUAdapter

ROOT = Path(__file__).resolve().parents[3]


class NotebookSessionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.settings = WorkspaceSettings(ROOT/'apps/web/public', root/'jobs.sqlite3', agent_cwd=root, compute_transport='local')
        store = SQLiteJobStore(self.settings.database_path)
        store.initialize()
        self.service = QuantumWorkspaceService(store, LocalCPUAdapter())
        self.python = PythonRuns(self.settings, self.service)
        self.sessions = NotebookSessions(self.settings, self.python)
        catalog = json.loads((self.settings.web_root/'notebooks/catalog.json').read_text())
        item = next(item for item in catalog['entries'] if item['path'] == 'community/basic_examples/superposition')
        self.key = '1' * 32
        self.doc = self.sessions.create({'notebook_id': item['id'], 'request_id': self.key})

    def tearDown(self):
        self.sessions.close()
        self.python.close()
        self.service.close()
        self.tmp.cleanup()

    def save(self, sources):
        self.doc = self.sessions.save(self.key, {'revision': self.doc['revision'], 'cells': [
            {'id': str(i + 2) * 32, 'cell_type': 'code', 'source': source} for i, source in enumerate(sources)]})

    def execute(self, indexes, request='a' * 32):
        data = {'request_id': request, 'revision': self.doc['revision'], 'cell_ids': [self.doc['cells'][i]['id'] for i in indexes]}
        self.sessions.execute(self.key, data)
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            self.doc = self.sessions.read(self.key)
            run = next(run for run in self.doc['runs'] if run['id'] == request)
            if run['status'] not in ('running', 'queued'):
                return run, data
            time.sleep(.05)
        self.fail('Kernel did not settle')

    def test_real_kernel_shared_variables_rich_output_error_and_idempotence(self):
        self.save(['value = 40\nvalue += 1', 'value += 1\nprint(value)\nfrom IPython.display import display\ndisplay({"answer": value})', 'raise ValueError("expected cell failure")', 'value = 999'])
        first, _ = self.execute([0])
        self.assertEqual(first['status'], 'completed', first)
        second, data = self.execute([1], 'b'*32)
        self.assertEqual(second['status'], 'completed', second)
        self.assertTrue(any('42' in output.get('text', '') for output in second['cells'][0]['outputs']))
        self.assertTrue(any(output['output_type'] == 'display_data' for output in second['cells'][0]['outputs']))
        self.assertTrue(all('execution_count' not in output for output in second['cells'][0]['outputs'] if output['output_type'] == 'display_data'))
        self.sessions.execute(self.key, data)
        self.assertEqual(len(self.sessions.read(self.key)['runs']), 2)
        failed, _ = self.execute([2, 3], 'c'*32)
        self.assertEqual(failed['status'], 'failed')
        self.assertEqual(failed['cells'][1]['status'], 'skipped')
        self.assertEqual(failed['cells'][0]['outputs'][0]['ename'], 'ValueError')
        self.sessions.control(self.key, 'restart')
        lost, _ = self.execute([1], 'd'*32)
        self.assertEqual(lost['status'], 'failed')
        self.assertEqual(lost['cells'][0]['outputs'][0]['ename'], 'NameError')

    def test_interrupt_and_service_restart_preserve_sources_history(self):
        self.save(['import time\nprint("started", flush=True)\ntime.sleep(60)'])
        data = {'request_id': 'e'*32, 'revision': self.doc['revision'], 'cell_ids': [self.doc['cells'][0]['id']]}
        self.sessions.execute(self.key, data)
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            current = self.sessions.read(self.key)
            if current['runs'][0]['cells'][0]['outputs']:
                break
            time.sleep(.1)
        self.sessions.control(self.key, 'interrupt')
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and self.sessions.read(self.key)['kernel'] == 'busy':
            time.sleep(.05)
        self.assertEqual(self.sessions.read(self.key)['runs'][0]['status'], 'failed')
        self.sessions.close()
        self.sessions = NotebookSessions(self.settings, self.python)
        restored = self.sessions.read(self.key)
        self.assertEqual(restored['kernel'], 'stopped')
        self.assertEqual(restored['cells'][0]['source'], self.doc['cells'][0]['source'])
        self.sessions.execute(self.key, data)
        self.assertEqual(len(self.sessions.read(self.key)['runs']), 1)
        self.assertEqual(self.sessions.read(self.key)['kernel'], 'stopped')

    def test_conflicts_block_stale_saves_and_changed_request(self):
        original = self.doc
        self.save(['print(1)'])
        with self.assertRaises(ProjectConflict):
            self.sessions.save(self.key, {'revision': original['revision'], 'cells': self.doc['cells']})
        run, data = self.execute([0])
        self.save(['print(2)'])
        with self.assertRaises(ProjectConflict):
            self.sessions.execute(self.key, {**data, 'revision': self.doc['revision']})

    def test_real_flagquantum_result_survives_between_cells(self):
        self.save(['import flagquantum as fq\nresult = fq.run(fq.Circuit(1).x(0), outputs=fq.counts(), options=fq.ExecutionOptions(shots=8, seed=42))',
                   'print(result.counts)\nfq.save("cell-result.fqx", result.plan, result=result)\nassert fq.load("cell-result.fqx").result.counts == result.counts'])
        run, _ = self.execute([0, 1])
        self.assertEqual(run['status'], 'completed', run)
        archive = self.settings.database_path.parent/'notebook-workspaces'/self.key/'cell-result.fqx'
        self.assertTrue(archive.is_file())

    def test_restart_marks_interrupted_cells_without_replaying_them(self):
        self.sessions.runs.put({'id': 'f'*32, 'notebook_id': self.key, 'status': 'running',
                               'cells': [{'id': '2'*32, 'source': 'print(1)', 'outputs': [], 'status': 'running'}]})
        self.sessions.close()
        self.sessions = NotebookSessions(self.settings, self.python)
        restored = self.sessions.read(self.key)
        self.assertEqual(restored['kernel'], 'stopped')
        self.assertEqual(restored['runs'][0]['status'], 'interrupted')
        self.assertEqual(restored['runs'][0]['cells'][0]['status'], 'interrupted')

    def test_notebook_only_helpers_and_data_preparation_are_included(self):
        workspace = self.settings.database_path.parent/'notebook-workspaces'/self.key
        bundle = json.loads((self.settings.web_root/'notebooks'/(self.doc['notebook_id']+'.json')).read_text())
        self.assertIn('examples/synthesis/compare_states.py', bundle['files'])
        entries = json.loads((self.settings.web_root/'notebooks/catalog.json').read_text())['entries']
        item = next(item for item in entries if json.loads((self.settings.web_root/'notebooks'/(item['id']+'.json')).read_text())['inputHashes'])
        doc = self.sessions.create({'notebook_id': item['id'], 'request_id': '9'*32})
        self.assertIn('from notebook_inputs import prepare', doc['cells'][0]['source'])
        self.key, self.doc = doc['id'], doc
        run, _ = self.execute([0])
        self.assertEqual(run['status'], 'completed', run)
        bundle = json.loads((self.settings.web_root/'notebooks'/(item['id']+'.json')).read_text())
        import hashlib
        for name, expected in bundle['inputHashes'].items():
            path = workspace.parent/self.key/name
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected)

    def test_import_preserves_metadata_attachments_outputs_and_survives_restart(self):
        document = {'nbformat': 4, 'nbformat_minor': 5, 'metadata': {'research': {'seed': 42}}, 'cells': [
            {'id': 'md-original', 'cell_type': 'markdown', 'metadata': {'tags': ['intro']}, 'source': ['# Study\n', '**Result**'],
             'attachments': {'diagram.png': {'image/png': 'abc'}}},
            {'id': 'code-original', 'cell_type': 'code', 'metadata': {}, 'source': 'print(42)', 'execution_count': 7,
             'outputs': [{'output_type': 'stream', 'name': 'stdout', 'text': ['42\n']}]},
            {'id': 'raw-original', 'cell_type': 'raw', 'metadata': {'format': 'text'}, 'source': 'raw text'}]}
        data = {'request_id': '8'*32, 'notebook': document, 'title': 'study.ipynb'}
        imported = self.sessions.import_notebook(data)
        self.assertEqual(imported['runs'], [])
        self.assertEqual(imported['kernel'], 'stopped')
        self.assertEqual(imported['cells'][0]['source'], '# Study\n**Result**')
        self.assertEqual([c['notebook'] for c in imported['cells']], document['cells'])
        self.assertEqual(self.sessions.import_notebook(data)['id'], imported['id'])
        with self.assertRaises(ProjectConflict):
            self.sessions.import_notebook({**data, 'notebook': {**document, 'metadata': {}}})
        imported['cells'][1]['source'] = 'print(43)'
        self.sessions.save(imported['id'], {'revision': imported['revision'], 'cells': imported['cells']})
        self.sessions.close()
        self.sessions = NotebookSessions(self.settings, self.python)
        restored = self.sessions.create({'request_id': imported['id'], 'notebook_id': imported['notebook_id']})
        self.assertEqual(restored['metadata'], document['metadata'])
        self.assertEqual(restored['cells'][1]['notebook'], document['cells'][1])
        self.key, self.doc = restored['id'], restored
        run, _ = self.execute([1])
        self.assertEqual(run['status'], 'completed', run)
        self.assertIn('43', run['cells'][0]['outputs'][0]['text'])

    def test_import_rejects_invalid_sources_before_creating_document(self):
        for document in ({'nbformat': 3, 'cells': []}, {'nbformat': 4, 'cells': [{'cell_type': 'code', 'source': ['ok', 12]}]},
                         {'nbformat': 4, 'cells': [{'cell_type': 'code', 'source': 'a'*32769}]}):
            with self.assertRaises(ValueError):
                self.sessions.import_notebook({'request_id': '8'*32, 'notebook': document})
        self.assertIsNone(self.sessions.documents.get('8'*32))

    def test_kernel_completion_and_documentation_do_not_execute_cells(self):
        self.assertFalse(self.sessions.assist(self.key, {'source': 'pri', 'cursor': 3, 'kind': 'complete'})['available'])
        self.save(['research_value = 42\ndef research_function(alpha, beta=3):\n    """Research parameter documentation."""\n    return alpha + beta'])
        self.execute([0])
        completed = self.sessions.assist(self.key, {'source': 'research_v', 'cursor': 10, 'kind': 'complete'})
        self.assertIn('research_value', completed['matches'])
        inspected = self.sessions.assist(self.key, {'source': 'research_function(', 'cursor': 18, 'kind': 'inspect'})
        self.assertIn('alpha', inspected['documentation'])
        self.assertIn('Research parameter documentation', inspected['documentation'])
        self.assertEqual(len(self.sessions.read(self.key)['runs']), 1)
        self.save(['assert research_value == 42'])
        run, _ = self.execute([0], 'b'*32)
        self.assertEqual(run['status'], 'completed', run)
