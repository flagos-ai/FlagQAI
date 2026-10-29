from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
"""HTTP contract characterization; no SSH connection or production data required."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import Mock

from workspace_server.config import WorkspaceSettings
from workspace_server.http import create_server


class WorkspaceAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.settings = WorkspaceSettings(
            web_root=Path(self.temp.name), database_path=Path(self.temp.name)/'jobs.sqlite3',
            port=0, ssh_target=None,
        )
        (self.settings.web_root/'index.html').write_text('workspace')
        self.service = Mock()
        self.service.health.return_value = {'mode': 'real'}
        self.service.list_jobs.return_value = []
        self.service.compile.return_value = {'qubits': 2}
        self.server = create_server(self.settings, self.service)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_port

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temp.cleanup()

    def request(self, path, body=None, origin=None):
        conn = HTTPConnection('127.0.0.1', self.port)
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        conn.request('POST' if body is not None else 'GET', path,
                     json.dumps(body) if body is not None else None, headers)
        result = conn.getresponse()
        response = result.read()
        conn.close()
        return result.status, response

    def test_existing_static_health_and_jobs_contracts(self):
        self.assertEqual(self.request('/')[1], b'workspace')
        self.assertEqual(json.loads(self.request('/api/jobs')[1]), [])
        self.assertEqual(self.request('/api/health')[0], 200)

    def test_compilation_delegates_to_service(self):
        body = {'source': 'OPENQASM 2.0; qreg q[2];'}
        self.assertEqual(self.request('/api/compile', body)[0], 200)
        self.service.compile.assert_called_once_with(body)

    def test_foreign_origin_does_not_invoke_computation(self):
        status, _ = self.request('/api/compile', {'source': 'OPENQASM 2.0;'},
                                 'https://untrusted.example')
        self.assertEqual(status, 403)
        self.service.compile.assert_not_called()

    def test_unknown_post_does_not_invoke_computation(self):
        self.assertEqual(self.request('/api/unknown', {'source': 'x'})[0], 404)
        self.service.compile.assert_not_called()

    def test_service_failures_keep_http_status_and_error_message(self):
        from workspace_server.service import QueueFullError
        for error, status in [(ValueError('invalid circuit'), 400),
                              (QueueFullError('queue full'), 429),
                              (RuntimeError('SSH unavailable'), 502)]:
            self.service.compile.side_effect = error
            actual, body = self.request('/api/compile', {'source':'OPENQASM 2.0;'})
            self.assertEqual(actual, status)
            self.assertEqual(json.loads(body)['error'], str(error))
