"""Actual subprocess execution; no model calls and no quantum provider dependency."""
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from test_bridge import SOURCE, ScriptedCPU
from workspace_server.config import WorkspaceSettings
from workspace_server.python_runs import PythonRuns
from workspace_server.job_store import SQLiteJobStore
from workspace_server.service import QuantumWorkspaceService
from workspace_server.http import create_server
from workspace_server.bridge import WorkspaceBridge, BridgeConflict

class PythonRunCase(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();root=Path(self.temp.name)
        self.settings=WorkspaceSettings(root,root/'jobs.sqlite3',port=0,agent_cwd=root,compute_transport='local',local_python=sys.executable)
        store=SQLiteJobStore(self.settings.database_path);store.initialize()
        self.quantum=QuantumWorkspaceService(store,ScriptedCPU())
        self.runs=PythonRuns(self.settings,self.quantum)
    def tearDown(self):
        self.runs.close();self.quantum.close();self.temp.cleanup()
    def wait(self, run_id):
        for _ in range(200):
            result=self.runs.get(run_id)
            if result['status'] not in ('queued','running'):return result
            time.sleep(.03)
        self.fail('Python task did not settle')


class PythonTests(PythonRunCase):
    def test_real_stdout_is_live_and_source_snapshot_stays_immutable(self):
        source='import time\nprint("first output", flush=True)\ntime.sleep(.4)\nprint("中文 output")'
        run=self.runs.submit({'source':source,'name':'Live output'})
        for _ in range(100):
            current=self.runs.get(run['id'])
            if current['logs']:break
            time.sleep(.01)
        self.assertEqual(current['status'],'running')
        self.assertIn('first output',''.join(log['text'] for log in current['logs']))
        result=self.wait(run['id'])
        self.assertEqual(result['status'],'completed',result)
        self.assertEqual(result['source'],source)
        self.assertIn('中文 output',''.join(log['text'] for log in result['logs']))
        self.assertFalse(Path(result['runtime']['cwd']).exists())
    def test_traceback_exit_code_and_syntax_diagnostics_are_real(self):
        diagnostic=self.runs.validate('def broken(:\n pass')
        self.assertEqual(diagnostic['line'],1)
        result=self.wait(self.runs.submit({'source':'print("before")\nraise ValueError("actual failure")'})['id'])
        self.assertEqual(result['status'],'failed')
        self.assertEqual(result['exit_code'],1)
        error=''.join(log['text'] for log in result['logs'] if log['stream']=='stderr')
        self.assertIn('main.py", line 2',error);self.assertIn('actual failure',error)
    def test_cancel_terminates_worker_and_bounds_output(self):
        run=self.runs.submit({'source':'import time\nprint("x"*90000,flush=True)\ntime.sleep(30)'})
        for _ in range(100):
            current=self.runs.get(run['id'])
            if current.get('truncated'):break
            time.sleep(.02)
        self.assertTrue(current.get('truncated'))
        self.runs.cancel(run['id'])
        result=self.wait(run['id']);self.assertEqual(result['status'],'cancelled',result)
        self.assertLessEqual(sum(len(log['text']) for log in result['logs']),65536)
    def test_published_artifact_enters_existing_quantum_results_without_reexecution(self):
        compiled=ScriptedCPU().execute({})
        run={'id':'test','name':'Python Bell','source':'print(42)','elapsed_seconds':.1}
        result=self.runs.publish(run,{'name':'Bell','source':SOURCE,'compiled':compiled,'counts':{'00':512,'11':512}})
        self.assertEqual(result['program']['source'],SOURCE)
        job=self.quantum.get_job(result['job']['id'])
        self.assertEqual(job['result']['counts'],{'00':512,'11':512})
        self.assertEqual(job['origin']['source'],'print(42)')
        self.assertEqual(result['program']['origin']['language'],'python')
        self.assertEqual(self.quantum.adapter.calls,[])
    def test_native_python_operations_are_revision_bound_and_retry_safe(self):
        bridge=WorkspaceBridge(self.settings,self.quantum,self.runs)
        identity={'client':'python-client','session':'native-session'}
        bridge.publish({**identity,'name':'Python','source':'print(42)','language':'python','page':'model','turnSeq':7})
        def act(operation,key,**values):
            return bridge.act({**identity,'operation':operation,'request_id':key,**values})
        shared=act('model.share','share',expected_hash=act('status','status')['source_hash'])['file']
        self.assertTrue(shared['id'].endswith('.py'))
        with self.assertRaises(BridgeConflict): act('python.run','stale',model_id=shared['id'],expected_revision='stale')
        result=act('python.run','run',model_id=shared['id'],expected_revision=shared['revision'])
        repeated=act('python.run','run',model_id=shared['id'],expected_revision=shared['revision'])
        self.assertEqual(result['python_run']['id'],repeated['python_run']['id'])
        run=self.wait(result['python_run']['id']);self.assertEqual(run['status'],'completed')
        self.assertEqual(act('python.read','read',run_id=run['id'])['source'],'print(42)')
        self.assertTrue(all(event['turn_seq']==7 for event in bridge.events('python-client','native-session',0)))
    def test_invalid_artifacts_never_create_successful_quantum_jobs(self):
        with self.assertRaises(ValueError):
            self.runs.publish({'id':'bad','name':'Bad'}, {'source':SOURCE,'compiled':ScriptedCPU().execute({}),'counts':{'00':1},'statevector':[['invalid',0]]})
        self.assertEqual(self.quantum.list_jobs(),[])
    def test_http_requires_same_origin_and_returns_scoped_run_resources(self):
        server=create_server(self.settings,self.quantum)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        url='http://127.0.0.1:%s/api/python/runs'%server.server_port
        def submit(origin=None):
            headers={'Content-Type':'application/json'}
            if origin:headers['Origin']=origin
            return urlopen(Request(url,data=json.dumps({'source':'print(42)'}).encode(),headers=headers))
        try:
            with self.assertRaises(HTTPError) as error:submit('https://example.com')
            self.assertEqual(error.exception.code,403)
            with submit() as response:run=json.load(response)
            self.assertEqual(run['source'],'print(42)')
        finally:server.shutdown();server.server_close()


try:
    import flagquantum as fq
    HAS_FQX = callable(getattr(fq, 'save', None))
except ImportError:
    HAS_FQX = False


@unittest.skipUnless(HAS_FQX, 'Requires FlagQuantum save/load')
class PythonFQXTests(PythonRunCase):
    SOURCE = """import flagquantum as fq
circuit = fq.Circuit(2).h(0).cx(0, 1)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=128, seed=42))
fq.save('bell.fqx', result.plan, result=result)
print('saved', result.counts, flush=True)
"""

    def test_collects_multiple_real_sdk_files_and_links_the_exact_python_snapshot(self):
        source = self.SOURCE + "from pathlib import Path\nPath('nested').mkdir()\nfq.save('nested/circuit.fqx', circuit)\n"
        run = self.wait(self.runs.submit({'source': source})['id'])
        self.assertEqual(run['status'], 'completed', run)
        self.assertEqual(run['collection_status'], 'completed', run)
        self.assertEqual(run['runtime']['sdk_version'], fq.__version__)
        self.assertTrue(run['runtime']['save_load_supported'])
        self.assertEqual({ref['filename'] for ref in run['experiments']}, {'bell.fqx', 'nested/circuit.fqx'})
        self.assertEqual(sum(ref['has_result'] for ref in run['experiments']), 1)
        for ref in run['experiments']:
            record = self.runs.experiments.get(ref['id'])
            self.assertEqual(record['program']['origin']['source'], source)
            self.assertEqual(record['program']['origin']['run_id'], run['id'])
            self.assertEqual(record['program']['origin']['source_hash'], run['source_hash'])
            self.assertEqual(record['program']['experiment']['sha256'], ref['sha256'])
        self.assertEqual(self.quantum.adapter.calls, [])
        self.assertFalse(Path(run['runtime']['cwd']).exists())

    def test_native_reader_resolves_collected_experiments_and_their_jobs(self):
        run = self.wait(self.runs.submit({'source': self.SOURCE})['id'])
        bridge = WorkspaceBridge(self.settings, self.quantum, self.runs)
        identity = {'client': 'collected-client', 'session': 'collected-session'}
        bridge.publish({**identity, 'name': 'Python', 'source': self.SOURCE, 'language': 'python', 'page': 'model'})
        reference = run['experiments'][0]
        record = bridge.act({**identity, 'operation': 'experiment.read', 'experiment_id': reference['id']})
        self.assertEqual(record['program']['origin']['run_id'], run['id'])
        job = bridge.act({**identity, 'operation': 'job.read', 'job_id': reference['id']})
        self.assertEqual(sum(job['result']['counts'].values()), 128)

    def test_same_filename_in_a_new_run_cannot_reuse_an_old_result(self):
        first = self.wait(self.runs.submit({'source': self.SOURCE})['id'])
        changed = self.SOURCE.replace("result = fq.run", "circuit.x(1)\nresult = fq.run")
        second = self.wait(self.runs.submit({'source': changed})['id'])
        self.assertEqual(second['status'], 'completed', second)
        a, b = first['experiments'][0]['id'], second['experiments'][0]['id']
        self.assertNotEqual(a, b)
        self.assertNotEqual(first['source_hash'], second['source_hash'])
        self.assertEqual(set(self.runs.experiments.get(a)['job']['result']['counts']), {'00', '11'})
        self.assertEqual(set(self.runs.experiments.get(b)['job']['result']['counts']), {'01', '10'})
        self.assertEqual(self.runs.get(first['id'])['source'], self.SOURCE)

    def test_corrupt_file_is_a_collection_error_and_does_not_fail_successful_python(self):
        source = self.SOURCE + "from pathlib import Path\nPath('broken.fqx').write_bytes(b'not an experiment')\n"
        run = self.wait(self.runs.submit({'source': source})['id'])
        self.assertEqual(run['status'], 'completed', run)
        self.assertEqual(run['exit_code'], 0)
        self.assertEqual(run['collection_status'], 'partial')
        self.assertEqual(len(run['experiments']), 1)
        self.assertEqual(run['collection_errors'][0]['filename'], 'broken.fqx')
        failed_file = self.runs.collection_file(run['id'], run['collection_errors'][0]['file_id'])
        self.assertEqual(failed_file.read_bytes(), b'not an experiment')
        with self.assertRaises(FileNotFoundError): self.runs.collection_file('other-run', run['collection_errors'][0]['file_id'])
        server = create_server(self.settings, self.quantum)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            path = '/api/python/runs/' + run['id'] + '/files/' + run['collection_errors'][0]['file_id']
            with urlopen('http://127.0.0.1:%d%s' % (server.server_port, path), timeout=5) as response:
                self.assertEqual(response.read(), b'not an experiment')
        finally:
            server.shutdown()
            server.server_close()

    def test_failed_script_retains_complete_outputs_with_failed_execution_origin(self):
        run = self.wait(self.runs.submit({'source': self.SOURCE + "raise ValueError('failure after save')\n"})['id'])
        self.assertEqual(run['status'], 'failed', run)
        self.assertEqual(run['exit_code'], 1)
        self.assertEqual(run['collection_status'], 'completed')
        record = self.runs.experiments.get(run['experiments'][0]['id'])
        self.assertEqual(record['program']['origin']['execution_status'], 'failed')
        self.assertEqual(record['program']['experiment']['python_run']['execution_status'], 'failed')

    def test_no_terminal_status_is_published_while_collection_is_in_progress(self):
        from unittest.mock import patch
        entered, release = threading.Event(), threading.Event()
        original = self.runs.experiments.import_file
        def delayed(*args, **kwargs):
            entered.set()
            if not release.wait(5): raise AssertionError('test did not release importer')
            return original(*args, **kwargs)
        with patch.object(self.runs.experiments, 'import_file', side_effect=delayed):
            run = self.runs.submit({'source': self.SOURCE})
            try:
                self.assertTrue(entered.wait(5))
                current = self.runs.get(run['id'])
                self.assertEqual(current['status'], 'running')
                self.assertEqual(current['execution_status'], 'completed')
                self.assertEqual(current['collection_status'], 'collecting')
            finally:
                release.set()
            settled = self.wait(run['id'])
            self.assertEqual(len(settled['experiments']), 1)

    def test_symlinks_to_previous_or_external_files_are_not_collected(self):
        external = Path(self.temp.name) / 'external.fqx'
        fq.save(external, fq.Circuit(1).h(0))
        source = "from pathlib import Path\nPath('linked.fqx').symlink_to(" + repr(str(external)) + ")\n"
        run = self.wait(self.runs.submit({'source': source})['id'])
        self.assertEqual(run['status'], 'completed', run)
        self.assertEqual(run['experiments'], [])
        self.assertEqual(run['collection_status'], 'failed')
        self.assertTrue(external.exists())

    def test_cancelled_scripts_do_not_collect_files_saved_before_cancellation(self):
        run = self.runs.submit({'source': self.SOURCE + 'import time\ntime.sleep(30)\n'})
        for _ in range(200):
            current = self.runs.get(run['id'])
            if 'saved' in ''.join(item['text'] for item in current['logs']): break
            time.sleep(.02)
        self.runs.cancel(run['id'])
        result = self.wait(run['id'])
        self.assertEqual(result['status'], 'cancelled', result)
        self.assertEqual(result['experiments'], [])
        self.assertEqual(result['collection_status'], 'cancelled')
