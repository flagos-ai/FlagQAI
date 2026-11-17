from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
"""HTTP contract characterization; no SSH connection or production data required."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import subprocess
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import Mock, patch

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
            exports.append({'name': name + '.stdout.json', 'sha256': hashlib.sha256(output).hexdigest()})
        package = b'fixture export bytes'
        (work / 'submission.zip').write_bytes(package)
        exports.append({'name': 'submission.zip', 'sha256': hashlib.sha256(package).hexdigest()})
        provenance = {}
        for filename, key in (('verifier.py', 'verifier_sha256'), ('official-metric.py', 'metric_sha256')):
            content = b'raise AssertionError("Staging must never execute this file")\n'
            (work / filename).write_bytes(content)
            provenance[key] = hashlib.sha256(content).hexdigest()
            exports.append({'name': filename, 'sha256': provenance[key]})
        source = f'X q0 # {identity}'.encode()
        (work / 'candidate.kmx').write_bytes(source)
        exports.append({'name': 'candidate.kmx', 'sha256': hashlib.sha256(source).hexdigest()})
        report = {'id': identity, 'status': 'completed', 'created_at': '2026-11-05T00:00:00+00:00',
                  'scope': 'Synthetic test fixture', 'variants': variants, 'exports': exports,
                  'provenance': provenance}
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
        download = next(item['url'] for item in run['exports'] if item['name'] == 'candidate.kmb')
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

    def test_candidate_revision_binds_review_to_source_and_adopted_baseline(self):
        work, parent = self.saved_verifier_fixture()
        baseline_work, baseline = self.saved_verifier_fixture('b' * 32)
        route = '/api/research-runs/invsqrt-'
        self.assertEqual(self.request(route + baseline['id'] + '/baseline', {
            'decision': 'adopt', 'source_sha256': baseline['exports'][-1]['sha256'],
            'expected_project_revision': 0, 'request_id': 'adopt',
        })[0], 200)
        revision = route + parent['id'] + '/revision'
        data = {
            'request_id': 'stage', 'parent_sha256': parent['exports'][-1]['sha256'],
            'expected_project_revision': 1, 'before': 'X q0', 'after': 'Z q0',
            'reason': 'Compare a single gate change',
        }
        self.assertEqual(self.request(revision, {**data, 'expected_project_revision': 0})[0], 409)
        self.assertEqual(self.request(revision, {**data, 'parent_sha256': 'c' * 64})[0], 409)
        self.assertEqual(self.request(revision, {**data, 'before': ' '})[0], 409)
        old = (work / 'candidate.kmx').read_bytes()
        status, body = self.request(revision, data)
        self.assertEqual(status, 200)
        identity = json.loads(body)['research_run']['id']
        self.assertEqual(self.request(revision, data), (200, body))
        self.assertEqual(self.request(revision, {**data, 'after': 'R q0'})[0], 409)
        run = json.loads(self.request('/api/research-runs/' + identity)[1])['run']
        self.assertEqual(run['status'], 'review')
        self.assertEqual(run['exports'], [])
        self.assertEqual(run['proposal']['parent'], 'invsqrt-' + parent['id'])
        self.assertEqual(run['proposal']['baseline_parent'], 'invsqrt-' + baseline['id'])
        self.assertIn('+Z q0', run['proposal']['diff'])
        draft = work.parent / identity.removeprefix('invsqrt-')
        self.assertEqual((draft / 'baseline.kmb').read_bytes(), (baseline_work / 'candidate.kmb').read_bytes())
        self.assertEqual((work / 'candidate.kmx').read_bytes(), old)
        self.assertFalse((draft / 'candidate.kmb').exists())
        self.assertEqual(len(json.loads(self.request('/api/research-runs')[1])['runs']), 3)
        self.service.submit.assert_not_called()

    def test_failed_candidate_can_be_revised_without_erasing_the_attempt(self):
        work, parent = self.saved_verifier_fixture()
        failed_id = 'c' * 32
        failed = work.parent / failed_id
        failed.mkdir()
        source = b'Z q0'
        digest = hashlib.sha256(source).hexdigest()
        (failed / 'candidate.kmx').write_bytes(source)
        report = {
            'id': failed_id, 'status': 'failed', 'created_at': '2026-11-06T00:00:00+00:00',
            'error': 'Recorded verifier failure',
            'proposal': {'parent': 'invsqrt-' + parent['id'], 'source_sha256': digest},
        }
        stored = json.dumps(report).encode()
        (failed / 'report.json').write_bytes(stored)
        route = '/api/research-runs/invsqrt-' + failed_id + '/revision'
        status, body = self.request(route, {
            'request_id': 'repair', 'parent_sha256': digest, 'expected_project_revision': 0,
            'before': 'Z q0', 'after': 'X q0', 'reason': 'Try a new gate',
        })
        self.assertEqual(status, 200)
        identity = json.loads(body)['research_run']['id']
        detail = json.loads(self.request('/api/research-runs/' + identity)[1])['run']
        self.assertEqual(detail['proposal']['parent'], 'invsqrt-' + failed_id)
        self.assertEqual(detail['proposal']['baseline_parent'], 'invsqrt-' + parent['id'])
        self.assertEqual((failed / 'report.json').read_bytes(), stored)

    def stage_verification_fixture(self):
        _, parent = self.saved_verifier_fixture()
        status, body = self.request('/api/research-runs/invsqrt-' + parent['id'] + '/revision', {
            'request_id': 'stage-review', 'parent_sha256': parent['exports'][-1]['sha256'],
            'expected_project_revision': 0, 'before': 'X q0', 'after': 'Z q0',
            'reason': 'Stage candidate for review',
        })
        self.assertEqual(status, 200, body)
        identity = json.loads(body)['research_run']['id']
        target = '/api/research-runs/' + identity
        _, body = self.request(target)
        return target, json.loads(body)['run']['source_sha256']

    def test_candidate_rejection_is_idempotent_and_never_launches(self):
        target, source = self.stage_verification_fixture()
        data = {'decision': 'reject', 'source_sha256': source,
                'expected_project_revision': 0, 'request_id': 'reject-one'}
        with patch('workspace_server.research_execution.subprocess.Popen') as start:
            status, body = self.request(target + '/decision', data)
            self.assertEqual(status, 200, body)
            self.assertEqual(json.loads(body)['run']['status'], 'rejected')
            self.assertEqual(self.request(target + '/decision', data), (status, body))
            self.assertEqual(self.request(target + '/decision', {**data, 'decision': 'verify'})[0], 409)
            start.assert_not_called()

    def test_verification_retries_attach_to_the_live_lease_and_preserve_interruption(self):
        target, source = self.stage_verification_fixture()
        data = {'decision': 'verify', 'source_sha256': source,
                'expected_project_revision': 0, 'request_id': 'verify-once'}
        route = target + '/decision'
        # Test scripts have no trusted digest and must never be executed.
        self.assertEqual(self.request(route, data)[0], 409)
        real_popen = subprocess.Popen
        processes = []

        def hold_lease(*args, **kwargs):
            process = real_popen(
                [sys.executable, '-c', 'import time; time.sleep(30)'],
                pass_fds=kwargs['pass_fds'],
            )
            processes.append(process)
            return process

        with patch('workspace_server.research_execution.pinned_code'), \
                patch('workspace_server.research_execution.subprocess.Popen', side_effect=hold_lease) as start:
            self.assertEqual(self.request(route, {**data, 'expected_project_revision': 1})[0], 409)
            self.assertEqual(self.request(route, {**data, 'source_sha256': 'd' * 64})[0], 409)
            status, body = self.request(route, data)
            self.assertEqual(status, 200, body)
            try:
                self.assertEqual(json.loads(body)['run']['status'], 'running')
                self.assertEqual(self.request(route, data), (status, body))
                self.assertEqual(json.loads(self.request(target)[1])['run']['status'], 'running')
            finally:
                for process in processes:
                    process.terminate()
                    process.wait(timeout=5)
            recovered = json.loads(self.request(target)[1])['run']
            self.assertEqual(recovered['status'], 'interrupted')
            self.assertIn('interrupted_at', recovered['evidence']['execution'])
            self.assertEqual(self.request(route, data)[0], 200)
            start.assert_called_once()

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
