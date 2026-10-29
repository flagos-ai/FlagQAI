import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
from workspace_server.history_preferences import history_trash

class HistoryPreferencesTests(unittest.TestCase):
    def test_trash_restore_and_restart_keep_only_references_and_never_touch_native_history(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);native=root/'native-record';native.write_text('original transcript')
            self.assertEqual(history_trash(root),[])
            self.assertEqual(history_trash(root,'dsh','one',True),[{'backendId':'dsh','sessionId':'one'}])
            self.assertEqual(len(history_trash(root,'dsh','one',True)),1)
            self.assertEqual(len(history_trash(root)),1)
            self.assertEqual(history_trash(root,'dsh','one',False),[])
            self.assertEqual(native.read_text(),'original transcript')
    def test_symlink_directories_and_preferences_are_not_followed(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'.flagqai').symlink_to(root,target_is_directory=True)
            with self.assertRaises(OSError):history_trash(root)
            (root/'.flagqai').unlink();history_trash(root)
            secret=root/'secret';secret.write_text('[]');(root/'.flagqai/quantum-workspace/history-trash.json').symlink_to(secret)
            with self.assertRaises(OSError):history_trash(root,'dsh','one',True)
            self.assertEqual(secret.read_text(),'[]')
