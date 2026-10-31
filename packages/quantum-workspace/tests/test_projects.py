"""Bounded project files, conflict-safe saves and actual frozen SDK execution."""
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from test_python_runs import PythonRunCase
from test_experiments import HAS_FQX
from workspace_server.projects import Projects, ProjectConflict
from workspace_server.http import create_server
from workspace_server.bridge import WorkspaceBridge

class ProjectTests(PythonRunCase):
    def setUp(self):
        super().setUp()
        self.projects = self.runs.projects
        self.project = self.projects.open('experiments/bell', create=True)
        self.identity = self.project['id']
    def file(self, path, source): return self.projects.write(self.identity, path, source)
    def test_path_confinement_and_symlinks(self):
        for name in ('../outside', '/tmp/outside', 'a/../b', '.git', 'a//b', 'a\\b', 'node_modules/demo'):
            with self.assertRaises((ValueError, OSError)): self.projects.open(name, create=True)
        for name in ('../a.py', '/a.py', '.env.py', 'node_modules/a.py', 'a.txt'):
            with self.assertRaises((ValueError, OSError)): self.file(name, 'secret')
        root = Path(self.project['root'])
        (root/'external.py').symlink_to(Path(self.temp.name)/'outside.py')
        with self.assertRaises(OSError): self.projects.read(self.identity, 'external.py')
        self.assertFalse(any(item['path']=='external.py' for item in self.projects.tree(self.identity)['files']))
        (root/'linked').symlink_to(Path(self.temp.name), target_is_directory=True)
        with self.assertRaises(OSError): self.file('linked/escape.py', 'outside')
        with self.assertRaises(ValueError): self.file('large.py', 'x'*32769)
    def test_revision_checked_save_and_recoverable_previous_bytes(self):
        first = self.file('src/main.py', 'print(1)')
        with self.assertRaises(ProjectConflict): self.file('src/main.py', 'overwrite')
        second = self.projects.write(self.identity, 'src/main.py', 'print(2)', first['revision'])
        with self.assertRaises(ProjectConflict): self.projects.write(self.identity, 'src/main.py', 'old draft', first['revision'])
        self.assertEqual(self.projects.read(self.identity,'src/main.py')['source'],'print(2)')
        self.assertEqual([path.read_bytes() for path in self.projects.backups.iterdir()],[b'print(1)'])
        reopened = Projects(self.settings)
        self.assertEqual(reopened.read(self.identity,'src/main.py')['revision'],second['revision'])
    def test_only_bounded_source_inputs_enter_snapshots(self):
        self.file('main.py','print(1)'); self.file('helper.py','VALUE=1')
        root=Path(self.project['root'])
        (root/'old.fqx').write_bytes(b'old output'); (root/'.env').write_text('secret')
        (root/'node_modules').mkdir(); (root/'node_modules'/'private.py').write_text('secret')
        self.assertEqual(set(self.projects.snapshot(self.identity,'main.py')['files']),{'main.py','helper.py'})
        with self.assertRaises(ProjectConflict): self.projects.snapshot(self.identity,'main.py',expected_hash='stale')
        with self.assertRaises(ProjectConflict): self.projects.snapshot(self.identity,'main.py',expected_revision='stale')
        for i in range(64): self.file('part%d.py'%i,'# file')
        with self.assertRaisesRegex(ValueError,'smaller project'): self.projects.snapshot(self.identity,'main.py')
    def test_queued_execution_uses_frozen_dependencies(self):
        entry=self.file('src/experiment.py','from helper import VALUE\nprint(VALUE)')
        helper=self.file('src/helper.py','VALUE=7')
        entered,release=threading.Event(),threading.Event(); command=self.runs.command
        def held(): entered.set();release.wait(5);return command()
        with patch.object(self.runs,'command',held):
            run=self.runs.submit_project({'project_id':self.identity,'entry':'src/experiment.py','expected_revision':entry['revision']})
            self.assertTrue(entered.wait(3))
            self.projects.write(self.identity,'src/helper.py','VALUE=99',helper['revision'])
            release.set(); result=self.wait(run['id'])
        self.assertEqual(result['status'],'completed',result)
        self.assertEqual(''.join(item['text'] for item in result['logs']).strip(),'7')
        self.assertNotEqual(result['project']['disk_hash'],self.projects.tree(self.identity)['snapshot_hash'])
        saved=self.settings.database_path.parent/'python-inputs'/(run['id']+'.json')
        self.assertEqual(json.loads(saved.read_text())['files']['src/helper.py'],'VALUE=7')
        self.assertFalse(Path(result['runtime']['cwd']).exists())
    def test_native_project_operations_are_revision_bound_and_idempotent(self):
        self.file('main.py','print("native project")')
        bridge=WorkspaceBridge(self.settings,self.quantum,self.runs)
        context={'client':'project-client','session':'native-session'}
        bridge.publish({**context,'source':'print(1)','name':'main','language':'python','page':'model'})
        inspected=bridge.act({**context,'operation':'project.inspect','project_id':self.identity})
        action={**context,'operation':'project.run','request_id':'project-run','project_id':self.identity,'entry':'main.py','expected_hash':inspected['snapshot_hash']}
        run=bridge.act(action)['python_run']
        self.assertEqual(bridge.act(action)['python_run']['id'],run['id'])
        self.assertEqual(self.wait(run['id'])['status'],'completed')
        self.assertEqual(len(self.runs.store.list()),1)
    def test_http_origin_and_save_conflicts(self):
        server=create_server(self.settings,self.quantum)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base='http://127.0.0.1:%d'%server.server_port
        def request(path,data=None,origin=None):
            headers={'Content-Type':'application/json'}
            if origin:headers['Origin']=origin
            return urlopen(Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=headers))
        try:
            with self.assertRaises(HTTPError) as error:request('/api/projects',{'path':'.'},'https://example.com')
            self.assertEqual(error.exception.code,403)
            with request('/api/projects',{'path':'http-project','create':True}) as response:project=json.load(response)
            route='/api/projects/'+project['id']+'/file'
            with request(route,{'path':'main.py','source':'print(1)'}) as response:first=json.load(response)
            with self.assertRaises(HTTPError) as error:request(route,{'path':'main.py','source':'overwrite'})
            self.assertEqual(error.exception.code,409)
            with request(route+'?path=main.py') as response:self.assertEqual(json.load(response)['revision'],first['revision'])
        finally:server.shutdown();server.server_close()
    @unittest.skipUnless(HAS_FQX,'Requires FlagQuantum save/load')
    def test_real_sdk_artifact_binds_all_project_input_versions(self):
        self.file('helper.py','def prepare(fq):\n    return fq.Circuit(2).h(0).cx(0,1)')
        entry=self.file('main.py','import flagquantum as fq\nfrom helper import prepare\nresult=fq.run(prepare(fq),outputs=fq.counts(),options=fq.ExecutionOptions(shots=128,seed=42))\nfq.save("bell.fqx",result.plan,result=result)')
        run=self.wait(self.runs.submit_project({'project_id':self.identity,'entry':'main.py','expected_revision':entry['revision']})['id'])
        self.assertEqual(run['status'],'completed',run)
        self.assertEqual(len(run['experiments']),1,run)
        record=self.runs.experiments.get(run['experiments'][0]['id'])
        self.assertEqual(record['program']['origin']['project'],run['project'])
        self.assertEqual(record['job']['origin']['project'],run['project'])
        self.assertEqual({item['path'] for item in run['project']['files']},{'main.py','helper.py'})
        self.assertEqual(set(record['job']['result']['counts']),{'00','11'})
