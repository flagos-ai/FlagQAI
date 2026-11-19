"""Recorded run downloads must remain independent of mutable projects."""
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import urlopen
from urllib.error import HTTPError

from workspace_server.config import WorkspaceSettings
from workspace_server.http import create_server
from workspace_server.job_store import SQLiteJobStore
from workspace_server.python_runs import PythonRuns
from workspace_server.service import QuantumWorkspaceService
from flagquantum_adapter.local_cpu import LocalCPUAdapter
from quantum_workspace_protocol import source_hash


class RunEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.settings = WorkspaceSettings(self.root, self.root/'jobs.sqlite3', agent_cwd=self.root, port=0,
                                          compute_transport='local')
        store = SQLiteJobStore(self.settings.database_path)
        store.initialize()
        self.service = QuantumWorkspaceService(store, LocalCPUAdapter())
        self.runs = PythonRuns(self.settings, self.service)
        project = self.runs.projects.open('notebook-copies/example', create=True)
        self.runs.projects.write(project['id'], 'main.py', 'print("original")\n')
        self.runs.projects.write(project['id'], 'helper.py', 'value = 1\n')
        bundle = self.runs.projects.snapshot(project['id'], 'main.py')
        self.identity = '12345678-1234-1234-1234-123456789abc'
        self.run = {'id': self.identity, 'name': 'Example', 'status': 'failed',
                    'source': bundle['files']['main.py'], 'source_hash': source_hash(bundle['files']['main.py']),
                    'project': bundle['project'], 'logs': [{'stream': 'stderr', 'text': 'Failure retained\n'}],
                    'environment': {'transport': 'local'}, 'error': 'Recorded failure'}
        self.runs.store.put(self.run)
        self.input = self.root/'python-inputs'/(self.identity+'.json')
        self.input.parent.mkdir()
        self.input.write_text(json.dumps({'entry': bundle['entry'], 'files': bundle['files']}))

    def tearDown(self):
        self.runs.close()
        self.service.close()
        self.temp.cleanup()

    def test_download_retains_original_inputs_failure_and_history_after_restart(self):
        prior = self.runs.projects.read(self.run['project']['id'], 'helper.py')
        self.runs.projects.write(self.run['project']['id'], 'helper.py', 'value = 2\n', prior['revision'])
        before = len(self.runs.store.list())
        self.runs.close()
        self.runs = PythonRuns(self.settings, self.service)
        report = self.runs.evidence(self.identity)
        self.assertEqual(report['inputs']['files']['helper.py'], 'value = 1\n')
        self.assertEqual(report['run']['error'], 'Recorded failure')
        self.assertEqual(report['run']['logs'], self.run['logs'])
        self.assertEqual(len(self.runs.store.list()), before)
        self.assertEqual(self.runs.projects.read(self.run['project']['id'], 'helper.py')['source'], 'value = 2\n')

    def test_modified_snapshot_or_source_is_rejected(self):
        inputs = json.loads(self.input.read_text())
        inputs['files']['helper.py'] = 'tampered\n'
        self.input.write_text(json.dumps(inputs))
        with self.assertRaisesRegex(ValueError, 'snapshot checksum'):
            self.runs.evidence(self.identity)
        self.run['source'] = 'tampered source'
        self.runs.store.put(self.run)
        with self.assertRaisesRegex(ValueError, 'source checksum'):
            self.runs.evidence(self.identity)
        with self.assertRaises(FileNotFoundError):
            self.runs.evidence('../../outside')

    def test_http_download_and_missing_snapshot_do_not_submit(self):
        server = create_server(self.settings, self.service)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = 'http://127.0.0.1:%s/api/python/runs/%s/evidence' % (server.server_address[1], self.identity)
        try:
            with urlopen(url) as response:
                self.assertIn('attachment', response.headers['Content-Disposition'])
                self.assertEqual(json.load(response)['inputs']['files']['helper.py'], 'value = 1\n')
            self.input.unlink()
            with self.assertRaises(HTTPError) as failure:
                urlopen(url)
            self.assertEqual(failure.exception.code, 404)
            self.assertEqual(len(self.runs.store.list()), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
