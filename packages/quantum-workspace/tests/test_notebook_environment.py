"""No model calls: actual interpreter import probes with isolated package fixtures."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from dataclasses import replace
import threading
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch

from workspace_server.config import WorkspaceSettings
from workspace_server.notebook_environment import check_environment, requirements, preparation
from workspace_server.python_runs import PythonRuns
from workspace_server.job_store import SQLiteJobStore
from workspace_server.service import QuantumWorkspaceService
from flagquantum_adapter.local_cpu import LocalCPUAdapter
from workspace_server.http import create_server


class NotebookEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        settings = WorkspaceSettings(self.root, self.root/'jobs.sqlite3', agent_cwd=self.root,
            compute_transport='local', local_python=sys.executable)
        store = SQLiteJobStore(settings.database_path)
        store.initialize()
        self.quantum = QuantumWorkspaceService(store, LocalCPUAdapter(sys.executable))
        self.runs = PythonRuns(settings, self.quantum)
        sdk = self.root/'flagquantum'
        sdk.mkdir()
        (sdk/'__init__.py').write_text('__version__="fixture"\ndef run(): pass\ndef save(): pass\ndef load(): pass\n')
        (sdk/'synth.py').write_text('def synthesize(): pass\n')
        (self.root/'torch.py').write_text('class cuda:\n    @staticmethod\n    def is_available(): return False\n')
        self.files = {'run_notebook.py': 'import runpy\nrunpy.run_module("examples.main")',
                      'examples/__init__.py': '',
                      'examples/main.py': 'from flagquantum import synth\nsynth.synthesize()\nraise RuntimeError("must not execute")'}

    def tearDown(self):
        self.runs.close()
        self.quantum.close()
        self.temp.cleanup()

    def check(self):
        with patch.dict(os.environ, {'PYTHONPATH': str(self.root)}):
            return check_environment(self.runs, self.files, 'run_notebook.py')[0]

    def test_ready_does_not_execute_research_or_submit_jobs(self):
        report = self.check()
        self.assertEqual(report['status'], 'ready', report)
        self.assertFalse(report['research_executed'])
        self.assertEqual(self.runs.store.list(), [])
        self.assertEqual(report['runtime']['sdk_version'], 'fixture')

    def test_missing_dependency_and_missing_sdk_api_are_distinct(self):
        self.files['examples/main.py'] += '\nimport definitely_missing_notebook_dependency\n'
        report = self.check()
        self.assertEqual(report['status'], 'missing_dependencies', report)
        self.assertEqual(report['preparation']['unmapped_imports'], ['definitely_missing_notebook_dependency'])
        self.files['examples/main.py'] = 'from flagquantum.synth import QNum\n'
        report = self.check()
        self.assertEqual(report['status'], 'sdk_incompatible', report)
        self.assertIn('flagquantum.synth.QNum', [i['name'] for i in report['incompatible_sdk']])

    def test_import_closure_ignores_type_only_and_optional_imports(self):
        files = {'run.py': 'from pkg import helper\n', 'pkg/__init__.py': '',
                 'pkg/helper.py': 'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n import absent_type\ntry:\n import optional\nexcept ImportError:\n pass\nimport scipy\n'}
        found = requirements(files, 'run.py')
        self.assertIn('scipy', found['modules'])
        self.assertNotIn('absent_type', found['modules'])
        self.assertNotIn('optional', found['modules'])
        self.assertIn('pkg/helper.py', found['source_files'])

    def test_lazy_chemistry_dependency_is_detected_and_has_install_guidance(self):
        files = {'run.py': 'from model import regenerate\nregenerate()\n',
                 'model.py': 'def regenerate():\n from pyscf import gto, scf\n return scf.RHF(gto.M())\n'}
        required = requirements(files, 'run.py')
        self.assertIn('pyscf', required['modules'])
        guide = preparation({'missing_dependencies': [{'name': 'pyscf'}]})
        self.assertIn('-m pip install pyscf', guide['commands'])
        self.assertEqual(guide['unmapped_imports'], [])

    def test_failed_check_blocks_project_run_before_queue_and_keeps_files(self):
        project = self.runs.projects.open('notebook-copies/test', create=True)
        source = 'from flagquantum.synth import MissingAPI\n'
        entry = self.runs.projects.write(project['id'], 'run_notebook.py', source)
        with patch.dict(os.environ, {'PYTHONPATH': str(self.root)}):
            with self.assertRaisesRegex(ValueError, 'No research code was executed'):
                self.runs.submit_project({'project_id': project['id'], 'entry': entry['path']})
        self.assertEqual(self.runs.store.list(), [])
        self.assertEqual(self.runs.projects.read(project['id'], entry['path'])['source'], source)

    def test_changes_are_checked_again_and_environment_change_invalidates_report(self):
        self.assertEqual(self.check()['status'], 'ready')
        self.files['examples/main.py'] += '\nimport definitely_missing_new_dependency\n'
        self.assertEqual(self.check()['status'], 'missing_dependencies')
        with patch('workspace_server.notebook_environment.selection', side_effect=[(self.runs.settings,0),(self.runs.settings,1)]):
            self.assertEqual(self.check()['status'], 'unavailable')

    def test_submission_uses_checked_settings_and_keeps_report(self):
        project = self.runs.projects.open('notebook-copies/bound', create=True)
        self.runs.projects.write(project['id'], 'main.py', 'print("bound runtime")')
        checked = self.runs.settings
        report = {'status':'ready', 'environment_revision':7, 'source_hash':'fixture', 'research_executed':False}
        # After the check the globally selected interpreter changes. The
        # submitted run must retain the exact checked interpreter and evidence.
        with patch('workspace_server.notebook_environment.check_environment', return_value=(report, checked)), \
                patch.object(self.runs, 'selected_settings', return_value=replace(checked, local_python='/missing/python')):
            created = self.runs.submit_project({'project_id':project['id'], 'entry':'main.py'})
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            result = self.runs.get(created['id'])
            if result['status'] not in ('queued', 'running'):
                break
            time.sleep(0.05)
        self.assertEqual(result['status'], 'completed', result)
        self.assertEqual(result['environment']['python'], checked.local_python)
        self.assertEqual(result['environment']['configuration_revision'], 7)
        self.assertEqual(result['notebook_environment'], report)

    def test_http_check_is_read_only_and_checks_origin(self):
        web = Path(__file__).resolve().parents[3] / 'apps/web/public'
        settings = replace(self.runs.settings, web_root=web, port=0)
        server = create_server(settings, self.quantum)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        item = json.loads((web/'notebooks/catalog.json').read_text())['entries'][0]
        address = 'http://127.0.0.1:%d/api/projects/notebook/check' % server.server_port
        body = json.dumps({'id': item['id']}).encode()
        try:
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(address, data=body, headers={'Content-Type':'application/json', 'Origin':'https://example.com'}))
            self.assertEqual(error.exception.code, 403)
            with patch.dict(os.environ, {'PYTHONPATH': str(self.root)}):
                with urlopen(Request(address, data=body, headers={'Content-Type':'application/json'})) as response:
                    report = json.load(response)
            self.assertEqual(report['status'], 'sdk_incompatible')
            self.assertFalse(report['research_executed'])
            self.assertFalse(list(self.root.glob('notebook-copies')))
            self.assertEqual(self.runs.store.list(), [])
        finally:
            server.shutdown()
            server.server_close()
