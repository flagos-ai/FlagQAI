"""Retry retained archives without executing Python or changing run provenance."""
import hashlib
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from test_python_runs import PythonRunCase
from workspace_server.http import create_server


class RecoveryTests(PythonRunCase):
    def retained(self):
        run = self.wait(self.runs.submit({'source': 'print("immutable output")'})['id'])
        content = b'archive bytes retained after preview failure'
        digest = hashlib.sha256(content).hexdigest()
        folder = self.settings.database_path.parent / 'python-artifacts' / run['id']
        folder.mkdir(parents=True)
        path = folder / (digest + '.fqx')
        path.write_bytes(content)
        run.update(collection_status='failed', collection_errors=[{
            'filename': 'nested/bell.fqx', 'file_id': digest, 'message': 'Preview unavailable'}])
        self.runs.store.put(run)
        return run, path, digest

    def test_retained_file_retry_preserves_failed_execution_and_is_repeat_safe(self):
        run, path, digest = self.retained()
        run.update(status='failed', execution_status='failed', exit_code=1)
        self.runs.store.put(run)
        record = {'id': 'fqx-new', 'program': {'experiment': {'has_result': True}}}
        with patch.object(self.runs.experiments, 'import_file', return_value=record) as importer, patch.object(self.runs, 'command', side_effect=AssertionError('must not execute')):
            result = self.runs.recollect(run['id'])
            importer.assert_called_once_with(path.read_bytes(), 'bell.fqx', python_run=result, task_path='nested/bell.fqx')
            self.assertEqual(result['experiments'], [{'id': 'fqx-new', 'filename': 'nested/bell.fqx', 'sha256': digest, 'has_result': True}])
            self.assertEqual(result['collection_status'], 'completed')
            for key in ('source', 'source_hash', 'logs', 'exit_code', 'status', 'execution_status', 'finished_at'):
                self.assertEqual(result[key], run[key], key)
            with self.assertRaisesRegex(ValueError, 'No complete retained files'):
                self.runs.recollect(run['id'])
            self.assertEqual(importer.call_count, 1)

    def test_checksum_missing_file_and_parser_errors_remain_recoverable(self):
        run, path, digest = self.retained()
        with patch.object(self.runs.experiments, 'import_file', side_effect=ValueError('SDK unavailable')):
            result = self.runs.recollect(run['id'])
            self.assertEqual(result['collection_status'], 'failed')
            self.assertEqual(result['collection_errors'][0]['file_id'], digest)
        original = path.read_bytes()
        path.write_bytes(b'changed')
        with patch.object(self.runs.experiments, 'import_file') as importer:
            self.assertIn('checksum', self.runs.recollect(run['id'])['collection_errors'][0]['message'])
            importer.assert_not_called()
        path.unlink()
        self.assertEqual(self.runs.recollect(run['id'])['collection_status'], 'failed')
        path.write_bytes(original)
        self.assertEqual(path.read_bytes(), original)

    def test_partial_retry_keeps_scan_errors_and_healthy_artifact_identity(self):
        run, path, digest = self.retained()
        run['experiments'] = [{'id': 'healthy', 'filename': 'healthy.fqx', 'sha256': 'old', 'has_result': False}]
        run['collection_errors'].append({'filename': 'too-big.fqx', 'message': 'File too large'})
        self.runs.store.put(run)
        with patch.object(self.runs.experiments, 'import_file', return_value={'id': 'recovered', 'program': {'experiment': {'has_result': False}}}):
            result = self.runs.recollect(run['id'])
        self.assertEqual(result['collection_status'], 'partial')
        self.assertEqual([item['id'] for item in result['experiments']], ['healthy', 'recovered'])
        self.assertEqual(result['collection_errors'], [{'filename': 'too-big.fqx', 'message': 'File too large'}])

    def test_active_and_duplicate_recollections_are_rejected(self):
        run, path, digest = self.retained()
        self.runs.recollecting.add(run['id'])
        with self.assertRaisesRegex(ValueError, 'Wait for'):
            self.runs.recollect(run['id'])
        self.runs.recollecting.clear()

    def test_http_recollection_does_not_submit_python(self):
        run, path, digest = self.retained()
        server = create_server(self.settings, self.quantum)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            request = Request('http://127.0.0.1:%d/api/python/runs/%s/collect' % (server.server_address[1], run['id']), data=b'{}', headers={'Content-Type': 'application/json'})
            with patch('workspace_server.python_runs.PythonRuns.submit', side_effect=AssertionError('must not execute')):
                with urlopen(request) as response:
                    result = json.load(response)
            self.assertEqual(result['id'], run['id'])
            self.assertEqual(result['source_hash'], run['source_hash'])
            self.assertEqual(result['status'], 'completed')
            self.assertEqual(result['collection_status'], 'failed')  # Deliberately invalid archive.
        finally:
            server.shutdown(); server.server_close(); thread.join()
