"""Binary collection limits, path confinement and checksum verification."""
import base64
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.python_artifacts import ExperimentTransfer
from workspace_server.python_worker import collect_experiments, FQX_LIMITS


class TransferTests(unittest.TestCase):
    def test_valid_chunks_preserve_bytes_but_bad_hash_never_completes(self):
        with tempfile.TemporaryDirectory() as folder:
            transfer = ExperimentTransfer(Path(folder))
            transfer.accept({'type': 'fqx-start', 'index': 1, 'name': 'nested/bell.fqx', 'size': 3})
            transfer.accept({'type': 'fqx-chunk', 'index': 1, 'data': base64.b64encode(b'abc').decode()})
            transfer.accept({'type': 'fqx-end', 'index': 1, 'sha256': hashlib.sha256(b'abc').hexdigest()})
            self.assertEqual(transfer.completed[0]['path'].read_bytes(), b'abc')
            transfer.accept({'type': 'fqx-start', 'index': 2, 'name': 'bad.fqx', 'size': 1})
            transfer.accept({'type': 'fqx-chunk', 'index': 2, 'data': 'YQ=='})
            with self.assertRaises(ValueError):
                transfer.accept({'type': 'fqx-end', 'index': 2, 'sha256': '0' * 64})
            transfer.discard()
            self.assertEqual(len(transfer.completed), 1)
            self.assertFalse((Path(folder) / 'experiment-2.fqx').exists())

    def test_paths_size_and_chunk_limits_are_checked_before_import(self):
        with tempfile.TemporaryDirectory() as folder:
            for name, size in [('../out.fqx', 1), ('/out.fqx', 1), ('bad.py', 1), ('empty.fqx', 0), ('big.fqx', FQX_LIMITS['file_bytes'] + 1)]:
                transfer = ExperimentTransfer(Path(folder))
                with self.assertRaises(ValueError):
                    transfer.accept({'type': 'fqx-start', 'index': 1, 'name': name, 'size': size})
                self.assertEqual(transfer.completed, [])
            transfer = ExperimentTransfer(Path(folder))
            transfer.accept({'type': 'fqx-start', 'index': 1, 'name': 'test.fqx', 'size': 1})
            with self.assertRaises(ValueError):
                transfer.accept({'type': 'fqx-chunk', 'index': 1, 'data': base64.b64encode(b'too long').decode()})
            transfer.discard()

    def test_scan_does_not_follow_external_symlink_directories(self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as previous:
            root = Path(folder)
            (Path(previous) / 'old.fqx').write_bytes(b'old')
            (root / 'previous').symlink_to(previous, target_is_directory=True)
            (root / 'new.fqx').write_bytes(b'new')
            events = []
            collect_experiments(root, events.append)
            self.assertEqual([event['name'] for event in events if event['type'] == 'fqx-start'], ['new.fqx'])

    def test_per_run_file_count_and_size_limits_report_partial_collection(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for index in range(12): (root / ('%d.fqx' % index)).write_bytes(b'x')
            events = []
            collect_experiments(root, events.append)
            self.assertEqual(sum(event['type'] == 'fqx-end' for event in events), 8)
            self.assertEqual(sum(event['type'] == 'artifact-error' for event in events), 4)
            with patch.dict(FQX_LIMITS, file_bytes=0):
                events = []
                collect_experiments(root, events.append)
                self.assertFalse(any(event['type'] == 'fqx-start' for event in events))
