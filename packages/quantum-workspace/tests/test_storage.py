from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
import json
from pathlib import Path
import tempfile
import unittest
from workspace_server.job_store import SQLiteJobStore


class StorageCompatibilityTests(unittest.TestCase):
    def test_existing_jobs_survive_and_incomplete_jobs_fail_on_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'jobs.sqlite3'
            store = SQLiteJobStore(path)
            store.initialize()
            store.put({'id':'done', 'status':'completed','request':{'source':'old'},'result':{'counts':{'0':7}}})
            store.put({'id':'interrupted','status':'running'})
            reopened = SQLiteJobStore(path)
            reopened.initialize()
            self.assertEqual(reopened.get('done')['result']['counts'], {'0':7})
            self.assertEqual(reopened.get('interrupted')['status'],'failed')
            self.assertIsNone(reopened.get('unknown'))
