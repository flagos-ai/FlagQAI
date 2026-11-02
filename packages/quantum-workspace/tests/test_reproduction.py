"""Reproduction comparison and durable explicit-submission contracts."""
import copy
import subprocess
from hashlib import sha256
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.reproduction import Reproductions, compare_runs, qaoa_metrics
from workspace_server.config import WorkspaceSettings


def fixture():
    source = 'EDGES = [(0, 1)]\n'
    run = {'id': 'old-run', 'name': 'QAOA', 'source': source, 'source_hash': sha256(source.encode()).hexdigest(), 'status': 'completed', 'collection_status': 'completed', 'experiments': [{'id': 'fqx-' + 'a' * 32, 'filename': 'result.fqx', 'sha256': sha256(b'archive').hexdigest(), 'has_result': True}]}
    record = {'program': {'compiled': {'qubits': 2, 'instructions': [{'name': 'rx', 'wires': [0], 'params': {'theta': .5}}], 'measurement_qubits': [0, 1]}, 'experiment': {'sha256': run['experiments'][0]['sha256'], 'has_result': True, 'producer_version': '0.4', 'measurements': [
        {'kind': 'probabilities', 'qubits': [0, 1], 'value': {'values': [0, .5, .5, 0], 'truncated': False}},
        {'kind': 'counts', 'qubits': [0, 1], 'shots': 10, 'metadata': {'seed': 42}, 'batches': [[{'key_type': 'string', 'state': '01', 'count': 5}, {'key_type': 'string', 'state': '10', 'count': 5}]]}]}}}
    replay = copy.deepcopy(run); replay['id'] = 'new-run'; replay['experiments'][0]['id'] = 'new'
    actual = copy.deepcopy(record); actual['program']['origin'] = {'run_id': 'new-run', 'source_hash': run['source_hash']}
    return run, replay, {'fqx-' + 'a' * 32: record}, {'new': actual}


class ReproductionTest(unittest.TestCase):
    def test_interrupted_collection_settles_after_restart_without_resubmission(self):
        from workspace_server.python_runs import PythonRuns
        from workspace_server.research_packages import validate_run
        with tempfile.TemporaryDirectory() as directory:
            settings = WorkspaceSettings(Path(directory), Path(directory) / 'jobs.sqlite3')
            runs = PythonRuns(settings, Mock())
            old, replay, _, _ = fixture()
            replay['experiments'][0]['id'] = 'fqx-' + 'b' * 32
            replay.update(status='running', collection_status='collecting',
                          execution_status='completed', logs=[{'text': 'execution finished'}])
            runs.store.put(replay)
            verification = Reproductions(settings, None, runs, None)
            verification.store.put({'id': 'restart-check', 'status': 'verifying',
                                    'run_id': replay['id'], 'original_run': old['id']})
            runs.close()
            restored = PythonRuns(settings, Mock())
            try:
                result = Reproductions(settings, None, restored, None).get('restart-check')
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(result['run_id'], replay['id'])
                settled = restored.get(replay['id'])
                self.assertEqual(settled['collection_status'], 'failed')
                self.assertEqual(settled['execution_status'], 'completed')
                self.assertEqual(settled['logs'], replay['logs'])
                self.assertIn('No task was resubmitted', settled['collection_errors'][0]['message'])
                validate_run(settled)
                self.assertEqual(len(restored.store.list()), 1)
            finally:
                restored.close()

    def test_weighted_metrics_use_saved_weights_and_reject_invalid_graphs(self):
        _, _, expected, _ = fixture()
        record = next(iter(expected.values()))
        metrics = qaoa_metrics('EDGES = [(0, 1, 12.5)]\n', record)
        self.assertEqual(metrics['classical_optimum'], 12.5)
        self.assertEqual(metrics['expected_cut'], 12.5)
        self.assertEqual(metrics['optimal_sample_rate'], 1)
        self.assertEqual(qaoa_metrics('EDGES: list = [\n(0, 1, 12.5), # bracket ] in comment\n]\n', record), metrics)
        for graph in ('[(0,1,0)]', '[(0,1,-1)]', '[(0,1,True)]', '[(0,1,1e309)]',
                      '[(0,0,2)]', '[(0,1),(1,0,2)]', '[(0,2,2)]', '[(0.0,1,2)]'):
            with self.subTest(graph=graph):
                self.assertIsNone(qaoa_metrics('EDGES = ' + graph, record))

    def test_unavailable_probe_is_a_durable_blocker_and_never_submits(self):
        for mode in ('missing', 'permission', 'timeout', 'exit', 'metadata'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                settings = WorkspaceSettings(Path(directory), Path(directory) / 'jobs.sqlite3')
                runs = Mock(); runs.environment.return_value = {'transport': 'local', 'python': '/missing/python'}
                service = Reproductions(settings, None, runs, None)
                old, _, records, _ = fixture()
                process = Mock(); process.returncode = 0
                process.communicate.return_value = ('[]' if mode == 'metadata' else '{}', 'private stderr')
                if mode == 'exit': process.returncode = 1
                if mode == 'timeout': process.communicate.side_effect = [subprocess.TimeoutExpired('probe', 25), ('', '')]
                problem = FileNotFoundError() if mode == 'missing' else PermissionError() if mode == 'permission' else None
                with patch.object(service, 'original', return_value=(old, records)), patch('workspace_server.reproduction.subprocess.Popen', return_value=process, side_effect=problem), patch('workspace_server.reproduction.os.killpg'):
                    saved = service.check({'run_id': old['id']})
                self.assertEqual(saved['status'], 'blocked')
                self.assertTrue(saved['error'])
                self.assertNotIn('private stderr', saved['error'])
                self.assertEqual(saved['runtime'], {})
                self.assertTrue(all(d['state'] == 'unchecked' for d in saved['preparation']['dependencies']))
                self.assertIn('python3 -m venv', saved['preparation']['commands'])
                self.assertFalse(saved['preparation']['installation_performed'])
                self.assertEqual(service.start(saved['id'])['status'], 'blocked')
                self.assertEqual(Reproductions(settings, None, runs, None).get(saved['id'])['source_hash'], old['source_hash'])
                runs.submit.assert_not_called()

    def test_exact_tolerance_count_difference_and_metrics(self):
        old, new, a, b = fixture()
        result = compare_runs(old, new, a, b)
        self.assertEqual(result['status'], 'exact')
        self.assertEqual(result['artifacts'][0]['original_metrics']['expected_cut'], 1)
        b['new']['program']['compiled']['instructions'][0]['params']['theta'] += 1e-9
        self.assertEqual(compare_runs(old, new, a, b)['status'], 'tolerance')
        b['new']['program']['experiment']['measurements'][1]['batches'][0][0]['count'] += 1
        b['new']['program']['experiment']['measurements'][1]['batches'][0][1]['count'] -= 1
        self.assertEqual(compare_runs(old, new, a, b)['status'], 'different')

    def test_source_missing_artifacts_truncated_and_unbound_results_never_pass(self):
        for mutation in ('source', 'missing', 'truncated', 'origin', 'nonfinite'):
            old, new, a, b = fixture()
            if mutation == 'source': new['source'] = 'modified'
            if mutation == 'missing': new['experiments'] = []
            if mutation == 'truncated': b['new']['program']['experiment']['measurements'][0]['value']['truncated'] = True
            if mutation == 'nonfinite': b['new']['program']['experiment']['measurements'][0]['value']['values'][0] = 'nan'
            if mutation == 'origin': b['new']['program']['origin']['run_id'] = 'unrelated'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): compare_runs(old, new, a, b)

    def test_probe_submits_nothing_explicit_start_is_idempotent_and_report_survives_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = WorkspaceSettings(Path(directory), Path(directory) / 'jobs.sqlite3')
            old, new, expected, actual = fixture()
            path = Path(directory) / 'archive.fqx'; path.write_bytes(b'archive')
            experiments = Mock(); experiments.file.return_value = path; experiments.get.side_effect = lambda i: (expected | actual)[i]
            runs = Mock(); runs.get.side_effect = lambda i: old if i == old['id'] else new
            runs.environment.return_value = {'transport': 'local', 'python': 'python'}
            runs.command.return_value = ['fixed-runtime-probe']
            runs.submit.return_value = new
            packages = Mock()
            service = Reproductions(settings, packages, runs, experiments)
            process = Mock(); process.communicate.return_value = ('{"python":"3.12", "sdk_version":"0.4", "save_load_supported":true, "pytorch":"2.13.0", "packages":{"torch":"2.13.0"}}', ''); process.returncode = 0
            with patch('workspace_server.reproduction.subprocess.Popen', return_value=process):
                checked = service.check({'run_id': old['id']})
            runs.submit.assert_not_called()
            self.assertEqual(checked['status'], 'prepared')
            submitted = service.start(checked['id'])
            self.assertEqual(submitted['run_id'], new['id'])
            service.start(checked['id']); runs.submit.assert_called_once()
            restored = Reproductions(settings, packages, runs, experiments).get(checked['id'])
            self.assertEqual(restored['status'], 'exact')
            self.assertEqual(restored['source_hash'], old['source_hash'])
            self.assertEqual(restored['artifacts'][0]['original_archive']['sha256'], old['experiments'][0]['sha256'])

    def test_changed_evidence_and_environment_and_uncertain_receipt_do_not_resubmit(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = WorkspaceSettings(Path(directory), Path(directory) / 'jobs.sqlite3')
            runs = Mock(); service = Reproductions(settings, None, runs, None)
            old, new, expected, actual = fixture()
            saved = {'id': 'prepared', 'status': 'prepared', 'created_at': __import__('time').time(), 'package_id': None, 'original_run': old['id'], 'source_hash': old['source_hash'], 'original_archives': old['experiments'], 'configured_environment': {'transport': 'local'}}
            service.store.put(saved)
            runs.environment.return_value = {'transport': 'ssh'}
            with patch.object(service, 'original', return_value=(old, expected)), self.assertRaises(ValueError): service.start(saved['id'])
            runs.submit.assert_not_called()
            runs.environment.return_value = saved['configured_environment']
            runs.submit.side_effect = OSError('connection lost after submission')
            with patch.object(service, 'original', return_value=(old, expected)), self.assertRaises(OSError): service.start(saved['id'])
            self.assertEqual(service.get(saved['id'])['status'], 'submission_unknown')
            service.start(saved['id']); runs.submit.assert_called_once()

    def test_saved_ir_matrix_changes_are_detected_even_when_diagram_is_identical(self):
        old, new, a, b = fixture()
        a[next(iter(a))]['program']['experiment']['execution_plan'] = {'program': {'instructions': [{'matrix': [1, 0, 0, 1]}]}}
        b['new']['program']['experiment']['execution_plan'] = {'program': {'instructions': [{'matrix': [0, 1, 1, 0]}]}}
        self.assertEqual(compare_runs(old, new, a, b)['status'], 'different')

    def test_unavailable_archive_finishes_as_incomplete_without_hiding_run(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = WorkspaceSettings(Path(directory), Path(directory) / 'jobs.sqlite3')
            old, new, expected, actual = fixture()
            runs = Mock(); runs.get.return_value = new
            experiments = Mock(); experiments.get.side_effect = lambda i: actual[i]
            experiments.file.side_effect = FileNotFoundError('archive unavailable')
            service = Reproductions(settings, None, runs, experiments)
            service.store.put({'id': 'missing', 'status': 'verifying', 'run_id': new['id'], 'package_id': None, 'original_run': old['id'], 'source_hash': old['source_hash'], 'original_archives': old['experiments']})
            with patch.object(service, 'original', return_value=(old, expected)):
                result = service.get('missing')
            self.assertEqual(result['status'], 'incomplete')
            self.assertEqual(result['run_id'], new['id'])
            self.assertIn('archive unavailable', result['error'])
            runs.submit.assert_not_called()

    def test_failed_execution_retained_and_expired_environment_refuses_submission(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = WorkspaceSettings(Path(directory), Path(directory) / 'jobs.sqlite3')
            runs = Mock(); runs.get.return_value = {'id': 'failed', 'status': 'failed', 'collection_status': 'failed', 'error': 'Python failure'}
            service = Reproductions(settings, None, runs, None)
            service.store.put({'id': 'test', 'status': 'verifying', 'run_id': 'failed'})
            self.assertEqual(service.get('test')['status'], 'failed')
            self.assertEqual(service.get('test')['error'], 'Python failure')
            service.store.put({'id': 'expired', 'status': 'prepared', 'created_at': 0})
            with self.assertRaises(ValueError): service.start('expired')
            runs.submit.assert_not_called()

if __name__ == '__main__': unittest.main()
