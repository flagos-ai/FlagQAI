"""Real action/HTTP/CLI boundaries with a scripted compute adapter, no LLM/SSH."""
import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'local'))
from workspace_server.bridge import WorkspaceBridge, BridgeConflict
from workspace_server.config import WorkspaceSettings
from workspace_server.http import create_server
from workspace_server.job_store import SQLiteJobStore
from workspace_server.service import QuantumWorkspaceService
from flagquantum_adapter.local_cpu import LocalCPUAdapter
from unittest.mock import patch

SOURCE = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0],q[1];\nmeasure q[0] -> c[0];\nmeasure q[1] -> c[1];'
class ScriptedCPU:
    transport = 'test fixture (no compute)'
    def __init__(self): self.calls = []
    def execute(self, request):
        self.calls.append(request)
        result = {'version':'fixture', 'backend':'test-only', 'qubits':2, 'depth':2, 'gate_counts':{'H':1,'CX':1}, 'instructions':[{'name':'H','wires':[0],'params':{}},{'name':'CX','wires':[0,1],'params':{}}], 'groups':{}, 'registers':[]}
        if request.get('operation') == 'run': result.update(counts={'00':request['shots']//2,'11':request['shots']-request['shots']//2},shots=request['shots'],seed=request['seed'],elapsed_seconds=0)
        return result

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root=Path(self.temp.name)
        self.store=SQLiteJobStore(self.root/'jobs.sqlite3'); self.store.initialize()
        self.adapter=ScriptedCPU(); self.service=QuantumWorkspaceService(self.store,self.adapter)
        self.settings=WorkspaceSettings(self.root,self.root/'jobs.sqlite3',port=0,agent_cwd=self.root)
        self.bridge=WorkspaceBridge(self.settings,self.service)
        self.context={'client':'client-1','session':'session-1','name':'Bell','source':SOURCE,'page':'model','turnSeq':5,'dirty':True}
        self.bridge.publish(self.context)
    def tearDown(self): self.service.close(); self.temp.cleanup()
    def action(self, operation, key, **values): return self.bridge.act({'client':'client-1','session':'session-1','operation':operation,'request_id':key,**values})
    def test_closed_loop_is_revision_bound_and_retry_safe(self):
        status=self.action('status','status')
        shared=self.action('model.share','share',expected_hash=status['source_hash'])['file']
        self.assertEqual(self.action('model.read','read',model_id=shared['id'])['source'],SOURCE)
        with self.assertRaises(BridgeConflict): self.action('compile','stale',model_id=shared['id'],expected_revision='old')
        compiled=self.action('compile','compile',model_id=shared['id'],expected_revision=shared['revision'])
        self.assertEqual(compiled,self.action('compile','compile',model_id=shared['id'],expected_revision=shared['revision']))
        self.assertEqual(len(self.adapter.calls),1)
        job=self.action('run','run',program_id=compiled['program']['id'],shots=1024,seed=42)['job']
        self.assertEqual(job['id'],self.action('run','run',program_id=compiled['program']['id'],shots=1024,seed=42)['job']['id'])
        for _ in range(100):
            result=self.action('job.read','read-job',job_id=job['id'])
            if result['status'] not in ('queued','running'): break
            time.sleep(.01)
        self.assertEqual(result['status'],'completed'); self.assertEqual(sum(result['result']['counts'].values()),1024)
        events=self.bridge.events('client-1','session-1',0)
        self.assertTrue(any(item['operation']=='compile' and item['status']=='completed' for item in events))
        self.assertTrue(all(item['turn_seq']==5 for item in events))
        self.assertEqual(self.bridge.events('client-1','other-session',0),[])
        with self.assertRaises(BridgeConflict): self.action('run','run',program_id=compiled['program']['id'],shots=2048)
    def test_context_switch_expiry_and_path_escape_fail_closed(self):
        with self.assertRaises(ValueError): self.action('model.read','bad',model_id='../../AGENTS.md')
        with self.assertRaises(BridgeConflict): self.action('model.share','wrong-hash',expected_hash='old')
        self.bridge.publish({**self.context,'session':'session-2'})
        with self.assertRaises(BridgeConflict): self.action('compile','wrong-session',source=SOURCE)
        self.bridge.contexts['client-1']['updated_at']=0
        with self.assertRaises(BridgeConflict): self.bridge.context('client-1')
        self.assertEqual(self.adapter.calls,[])
    def test_new_models_never_overwrite_an_existing_shared_file(self):
        first=self.action('model.create','create-1',source=SOURCE)['file']
        second=self.action('model.create','create-2',source=SOURCE)['file']
        self.assertNotEqual(first['id'],second['id'])
        self.assertEqual((self.root/first['path']).read_text(),SOURCE)
    def test_failed_compile_settles_the_observable_action(self):
        with patch.object(self.adapter, 'execute', side_effect=RuntimeError('Compiler rejected the circuit')):
            with self.assertRaisesRegex(RuntimeError, 'Compiler rejected'):
                self.action('compile', 'rejected', source=SOURCE)
        events = self.bridge.events('client-1', 'session-1', 0)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['status'], 'failed')
        self.assertIn('Compiler rejected', events[0]['error'])
        with self.assertRaises(BridgeConflict):
            self.action('compile', 'rejected', source=SOURCE)
    def test_polling_closes_database_handles_without_waiting_for_garbage_collection(self):
        # SQLite's transaction context manager does not close its connection.
        # Exercise a long-lived host under a small descriptor budget with GC off.
        script = '''
import gc, resource, tempfile
from pathlib import Path
from test_bridge import ScriptedCPU, WorkspaceSettings, SQLiteJobStore, QuantumWorkspaceService, WorkspaceBridge
gc.disable()
soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
resource.setrlimit(resource.RLIMIT_NOFILE, (min(64, hard), hard))
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    settings = WorkspaceSettings(root, root/'jobs.sqlite3', agent_cwd=root)
    store = SQLiteJobStore(settings.database_path); store.initialize()
    service = QuantumWorkspaceService(store, ScriptedCPU())
    bridge = WorkspaceBridge(settings, service)
    for _ in range(150):
        bridge.events('client-1', 'session-1', 0)
        store.list()
    service.close()
'''
        result = subprocess.run([sys.executable, '-c', script], cwd=Path(__file__).parent, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
    def test_restart_marks_unresolved_delivery_without_replaying_compute(self):
        class InterruptedProcess(BaseException): pass
        with patch.object(self.bridge, 'execute', side_effect=InterruptedProcess()):
            with self.assertRaises(InterruptedProcess):
                self.action('compile', 'interrupted', source=SOURCE)
        cursor = self.bridge.events('client-1', 'session-1', 0)[0]['seq']
        self.bridge = WorkspaceBridge(self.settings, self.service)
        self.bridge.publish(self.context)
        events = self.bridge.events('client-1', 'session-1', cursor)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['status'], 'failed')
        self.assertIn('Inspect existing programs and jobs', events[0]['error'])
        with self.assertRaises(BridgeConflict):
            self.action('compile', 'interrupted', source=SOURCE)
        self.assertEqual(self.adapter.calls, [])
    def test_native_entry_directory_does_not_shadow_stdlib_platform(self):
        directory=Path(__file__).resolve().parents[1]
        result=subprocess.run([sys.executable,'-B','-c',
            'import platform,uuid; assert callable(platform.system); print(platform.system()); print(uuid.uuid4())'],
            cwd=directory,capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_http_and_native_command_adapter_share_the_same_operations(self):
        server=create_server(self.settings,self.service)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        port=server.server_port
        def post(path, body, origin=None):
            headers={'Content-Type':'application/json'}
            if origin: headers['Origin']=origin
            request=Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(body).encode(),headers=headers)
            with urlopen(request,timeout=5) as response:return json.load(response)
        try:
            post('/api/workspace/context',self.context)
            script=Path(__file__).resolve().parents[1]/'workbench.py'
            result=subprocess.run([sys.executable,str(script),'--port',str(port),'--client','client-1','--session','session-1','status'],capture_output=True,text=True,timeout=5)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            status=json.loads(result.stdout)['result']
            self.assertEqual(status['name'],'Bell');self.assertNotIn('source',status)
            shared=post('/api/workspace/actions',{'client':'client-1','session':'session-1','operation':'model.share','request_id':'share-http','expected_hash':status['source_hash']})
            self.assertEqual(shared['file']['source'],SOURCE)
            with self.assertRaises(HTTPError) as error: post('/api/workspace/actions',{'client':'client-1','session':'session-1','operation':'run','request_id':'evil','source':SOURCE},'https://evil.example')
            self.assertEqual(error.exception.code,403)
        finally: server.shutdown();server.server_close()
    @patch('flagquantum_adapter.local_cpu.subprocess.run')
    def test_local_cpu_failure_never_falls_back_to_ssh(self, run):
        run.return_value=subprocess.CompletedProcess([],1,stdout=json.dumps({'ok':False,'error':'No module named flagquantum'}),stderr='')
        with self.assertRaisesRegex(RuntimeError,'No module named flagquantum'):LocalCPUAdapter('python-test').execute({'source':SOURCE})
        self.assertEqual(run.call_args.args[0][:2],['python-test','-c'])
