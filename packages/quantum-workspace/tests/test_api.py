from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
"""HTTP contract characterization; no SSH connection or production data required."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
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
            web_root=Path(self.temp.name).resolve(), database_path=Path(self.temp.name).resolve()/'jobs.sqlite3',
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

    def saved_verifier_fixture(self, identity='a' * 32):
        work = self.settings.database_path.parent / 'invsqrt' / identity
        work.mkdir(parents=True)
        variants, exports = [], []
        for name, score in [('baseline', 200), ('candidate', 180)]:
            filename = name + '.kmb'
            content = (name + ' circuit bytes').encode()
            digest = hashlib.sha256(content).hexdigest()
            result = {'status': 'PASS', 'verified_shots': 200540928,
                      'circuit_sha256': digest, 'score': score}
            output = json.dumps(result).encode()
            (work / filename).write_bytes(content)
            (work / (name + '.stdout.json')).write_bytes(output)
            variants.append({'name': name, 'seconds': 1, 'report': result,
                             'sha256': digest, 'report_sha256': hashlib.sha256(output).hexdigest()})
            exports.append({'name': filename, 'sha256': digest})
        package = b'fixture export bytes'
        (work / 'submission.zip').write_bytes(package)
        exports.append({'name': 'submission.zip', 'sha256': hashlib.sha256(package).hexdigest()})
        source = f'X q0 # {identity}'.encode()
        (work / 'candidate.kmx').write_bytes(source)
        exports.append({'name': 'candidate.kmx', 'sha256': hashlib.sha256(source).hexdigest()})
        report = {'id': identity, 'status': 'completed', 'created_at': '2026-11-05T00:00:00+00:00',
                  'scope': 'Synthetic test fixture', 'variants': variants, 'exports': exports}
        (work / 'report.json').write_text(json.dumps(report))
        return work, report

    def test_research_runs_project_archived_evidence_and_preserve_failed_history(self):
        self.assertEqual(json.loads(self.request('/api/research-runs')[1]), {'runs': []})
        work, archived = self.saved_verifier_fixture()
        failed_id = 'b' * 32
        (work.parent / 'current.json').write_text(json.dumps({
            'id': failed_id, 'status': 'failed', 'created_at': '2026-11-06T00:00:00+00:00',
            'error': 'Verification failed',
        }))
        status, body = self.request('/api/research-runs')
        self.assertEqual(status, 200)
        records = json.loads(body)['runs']
        self.assertEqual([item['status'] for item in records], ['failed', 'completed'])
        self.assertEqual({item['project']['id'] for item in records}, {'study-invsqrt'})
        status, body = self.request('/api/research-runs/' + records[1]['id'])
        self.assertEqual(status, 200)
        run = json.loads(body)['run']
        self.assertEqual(run['evidence'], archived)
        self.assertEqual(run['comparison']['rows'][4]['values'], [200, 180])
        self.assertEqual(run['comparison']['cost_ratio'], 200 / 180)
        download = run['exports'][1]['url']
        self.assertEqual(self.request(download), (200, b'candidate circuit bytes'))
        self.assertEqual(self.request(download, origin='https://untrusted.example')[0], 403)
        self.assertEqual(self.request('/api/research-runs/invsqrt-' + 'c' * 32)[0], 404)
        failed = '/api/research-runs/' + records[0]['id']
        self.assertEqual(json.loads(self.request(failed)[1])['run']['error'], 'Verification failed')
        self.assertEqual(self.request(failed + '/files/candidate.kmb')[0], 409)
        self.service.submit.assert_not_called()

    def test_research_exports_reject_changed_and_linked_evidence(self):
        work, report = self.saved_verifier_fixture()
        run = '/api/research-runs/invsqrt-' + report['id']
        candidate = work / 'candidate.kmb'
        download = run + '/files/candidate.kmb'
        self.assertEqual(self.request(run + '/files/../report.json')[0], 404)
        self.assertEqual(self.request(run + '/files/submission.zip'), (200, b'fixture export bytes'))
        (work / 'submission.zip').write_bytes(b'changed export')
        self.assertEqual(self.request(run)[0], 200)
        self.assertEqual(self.request(run + '/files/submission.zip')[0], 409)
        candidate.write_bytes(b'changed')
        self.assertEqual(self.request(run)[0], 409)
        self.assertEqual(self.request(download)[0], 409)
        candidate.unlink()
        outside = work.parent.parent / 'outside.kmb'
        outside.write_bytes(b'candidate circuit bytes')
        candidate.symlink_to(outside)
        self.assertEqual(self.request(download)[0], 409)
        candidate.unlink()
        candidate.write_bytes(b'candidate circuit bytes')
        stdout = work / 'candidate.stdout.json'
        stdout.write_bytes(stdout.read_bytes() + b'\n')
        self.assertEqual(self.request(run)[0], 409)

    def test_adopt_restore_and_retry_keep_baseline_history_and_reports(self):
        first, a = self.saved_verifier_fixture()
        _, b = self.saved_verifier_fixture('b' * 32)
        original = (first / 'report.json').read_bytes()
        url = '/api/research-runs/invsqrt-'

        def decide(report, revision, request_id, action='adopt'):
            return self.request(url + report['id'] + '/baseline', {
                'expected_project_revision': revision, 'request_id': request_id,
                'source_sha256': report['exports'][-1]['sha256'], 'decision': action,
            })

        self.assertEqual(decide(a, 0, 'first')[0], 200)
        self.assertEqual(decide(b, 0, 'stale')[0], 409)
        self.assertEqual(decide(b, 1, 'second')[0], 200)
        status, body = decide(a, 2, 'rollback', 'restore')
        self.assertEqual(status, 200)
        state = json.loads(body)['baseline']
        self.assertEqual(decide(b, 1, 'second'), (200, body))
        self.assertEqual(decide(a, 3, 'second')[0], 409)
        run = json.loads(self.request(url + a['id'])[1])['run']
        self.assertEqual(state['revision'], 3)
        self.assertEqual([event['action'] for event in state['history']], ['adopt', 'adopt', 'restore'])
        self.assertEqual(run['project']['baseline'], state)
        self.assertTrue(run['is_project_baseline'])
        self.assertEqual((first / 'report.json').read_bytes(), original)
        self.service.submit.assert_not_called()

    def test_concurrent_windows_cannot_both_adopt_at_one_revision(self):
        records = [self.saved_verifier_fixture(letter * 32)[1] for letter in 'ab']

        def adopt(report):
            return self.request('/api/research-runs/invsqrt-' + report['id'] + '/baseline', {
                'expected_project_revision': 0, 'request_id': report['id'],
                'source_sha256': report['exports'][-1]['sha256'], 'decision': 'adopt',
            })[0]

        with ThreadPoolExecutor(max_workers=2) as workers:
            self.assertEqual(sorted(workers.map(adopt, records)), [200, 409])

    def test_baseline_requires_the_reviewed_archived_source(self):
        work, report = self.saved_verifier_fixture()
        url = '/api/research-runs/invsqrt-' + report['id']
        data = {
            'expected_project_revision': 0, 'request_id': 'reviewed-source',
            'source_sha256': report['exports'][-1]['sha256'], 'decision': 'restore',
        }
        self.assertEqual(self.request(url + '/baseline', data)[0], 409)
        data['decision'] = 'adopt'
        (work / 'candidate.kmx').write_bytes(b'tampered source')
        self.assertEqual(self.request(url + '/baseline', data)[0], 409)
        (work / 'candidate.kmx').write_bytes(f"X q0 # {report['id']}".encode())
        (work / 'report.json').rename(work.parent / 'current.json')
        self.assertEqual(self.request(url)[0], 200)
        self.assertEqual(self.request(url + '/baseline', data)[0], 409)
        self.assertFalse((work.parent / 'project-baseline.json').exists())

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
