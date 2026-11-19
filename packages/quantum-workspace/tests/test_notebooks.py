"""Pinned notebook copies remain bounded, immutable and safe to retry."""
import hashlib
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from workspace_server.config import WorkspaceSettings
from workspace_server.projects import Projects, ProjectConflict
from workspace_server.notebooks import create_notebook_project

WEB = Path(__file__).resolve().parents[3] / 'apps/web/public'

class NotebookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.projects = Projects(WorkspaceSettings(WEB, self.root/'jobs.sqlite3', agent_cwd=self.root))
        self.entries = json.loads((WEB/'notebooks/catalog.json').read_text())['entries']
        self.item = next(e for e in self.entries if e['path']=='community/basic_examples/superposition')
    def tearDown(self): self.temp.cleanup()
    def copy(self, request='a'*32):
        return create_notebook_project(self.projects, WEB, self.item['id'], request)
    def test_all_212_notebooks_and_source_bundles_have_exact_pins(self):
        self.assertEqual(len(self.entries),212)
        self.assertEqual(len({e['id'] for e in self.entries}),212)
        for item in self.entries:
            raw=(WEB/'notebooks'/(item['id']+'.json')).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),item['bundleSha256'])
            data=json.loads(raw)
            for name,source in data['files'].items():
                compile(source,name,'exec')
                self.assertEqual(hashlib.sha256(source.encode()).hexdigest(),data['hashes'][name])
            raw=(WEB/'notebooks'/(item['id']+'.ipynb')).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),item['notebookSha256'])
            self.assertEqual(json.loads(raw)['nbformat'],4)
    def test_copy_and_response_loss_retry_preserve_same_project(self):
        first=self.copy();second=self.copy()
        self.assertEqual(first,second)
        self.assertEqual(len(self.projects.list()['projects']),1)
        snapshot=self.projects.snapshot(first['project']['id'],first['file']['path'])
        self.assertIn('run_notebook.py',snapshot['files'])
        self.assertIn('examples/synthesis/community/basic_examples/superposition/main.py',snapshot['files'])
        self.assertIn(self.item['notebookSha256'],snapshot['files']['run_notebook.py'])
        self.assertTrue((Path(first['project']['root'])/'walkthrough.ipynb').is_file())
        self.assertFalse(list(self.root.rglob('*.fqx')), 'Creating a copy must not execute it')
    def test_pinned_data_inputs_restore_exact_bytes_without_sdk_execution(self):
        # Exercise a real CSV-bearing workflow, without importing its SDK or code.
        bundle = next(data for item in self.entries
                      if (data := json.loads((WEB/'notebooks'/(item['id']+'.json')).read_text()))['inputHashes']
                      and any(name.endswith('.csv') for name in data['inputHashes']))
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name, source in bundle['files'].items():
                if name.startswith('notebook_input'):
                    (root/name).write_text(source)
            subprocess.run([sys.executable, '-c', 'from notebook_inputs import prepare; prepare()'],
                           cwd=root, check=True, capture_output=True)
            for name, expected in bundle['inputHashes'].items():
                self.assertEqual(hashlib.sha256((root/name).read_bytes()).hexdigest(), expected)
        result = create_notebook_project(self.projects, WEB, bundle['id'], 'c'*32)
        recorded = json.loads((Path(result['project']['root'])/'SOURCE.json').read_text())
        self.assertEqual(recorded['inputs'], bundle['inputHashes'])
    def test_retry_cannot_replace_research_edits(self):
        result=self.copy();file=result['file']
        self.projects.write(result['project']['id'],file['path'],'# my research',file['revision'])
        with self.assertRaises(ProjectConflict):self.copy()
        self.assertEqual(self.projects.read(result['project']['id'],file['path'])['source'],'# my research')
        new=self.copy('b'*32)
        self.assertNotEqual(new['project']['id'],result['project']['id'])
    def test_reject_paths_symlinks_and_changed_pins(self):
        for identity,request in [('../escape','a'*32),(self.item['id'],'../escape')]:
            with self.assertRaises(ValueError):create_notebook_project(self.projects,WEB,identity,request)
        (self.root/'notebook-copies').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(OSError):self.copy()
        with tempfile.TemporaryDirectory() as folder:
            fake=Path(folder);(fake/'notebooks').mkdir()
            (fake/'notebooks/catalog.json').write_text(json.dumps({'entries':[self.item]}))
            (fake/'notebooks'/(self.item['id']+'.json')).write_text('{}')
            with self.assertRaisesRegex(ValueError,'checksum'):
                create_notebook_project(self.projects,fake,self.item['id'],'a'*32)
