"""Compute selection persistence and immutable queued execution, without model calls."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch, Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.config import WorkspaceSettings
from workspace_server.compute_environments import ComputeEnvironments
from workspace_server.python_runs import PythonRuns
from workspace_server.service import QuantumWorkspaceService
from workspace_server.job_store import SQLiteJobStore
from flagquantum_adapter.ssh_cpu import SSHCPUAdapter

SOURCE = 'OPENQASM 2.0; include "qelib1.inc"; qreg q[1]; x q[0];'

class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.settings = WorkspaceSettings(self.root, self.root/'jobs.sqlite3', compute_transport='local', local_python=sys.executable)
        self.environments = ComputeEnvironments(self.settings)
        store = SQLiteJobStore(self.settings.database_path); store.initialize()
        self.service = QuantumWorkspaceService(store, Mock())
        self.runs = PythonRuns(self.settings, self.service)

    def tearDown(self):
        self.runs.close(); self.service.close(); self.temp.cleanup()

    def checked(self, config):
        result = subprocess.CompletedProcess([], 0, stdout=json.dumps({'python':'3.12', 'sdk_version':'test'}), stderr='')
        def probe(*args, stdout, **_):
            stdout.write(result.stdout.encode())
            return result
        with patch('workspace_server.compute_environments.subprocess.run', side_effect=probe):
            return self.environments.check(config, self.runs)

    def test_check_does_not_activate_and_activation_survives_restart(self):
        config = {**self.environments.config, 'transport':'ssh', 'ssh_target':'research-server', 'remote_python':'/opt/fq env/bin/python'}
        with self.assertRaisesRegex(ValueError, 'Check this exact'):
            self.environments.activate({'config':config, 'expected_revision':0})
        check = self.checked(config)
        self.assertEqual(self.environments.snapshot().compute_transport, 'local')
        self.environments.activate({'config':config, 'expected_revision':0, 'check_id':check['check_id']})
        restored = ComputeEnvironments(self.settings)
        self.assertEqual(restored.snapshot().remote_python, config['remote_python'])
        self.assertEqual(restored.snapshot().compute_transport, 'ssh')
        with self.assertRaisesRegex(ValueError, 'another window'):
            self.environments.activate({'config':config, 'expected_revision':0, 'check_id':check['check_id']})

    def test_check_receipts_are_bound_to_exact_config_and_revision(self):
        config = self.environments.describe()['config']
        alternate = {**config, 'local_python': '/a/different/python'}
        check = self.checked(config)
        request = {'config': config, 'check_id':check['check_id'], 'expected_revision':0}
        with self.assertRaisesRegex(ValueError, 'exact environment'):
            self.environments.activate({**request, 'config':alternate})
        with self.assertRaisesRegex(ValueError, 'another window'):
            self.environments.activate({**request, 'expected_revision':False})
        self.environments.activate(request)
        self.assertEqual(self.environments.path.stat().st_mode & 0o777, 0o600)
        with self.assertRaisesRegex(ValueError, 'exact environment'):
            self.environments.activate({**request, 'expected_revision':1})

    def test_failed_check_no_fallback_or_activation(self):
        config = {**self.environments.config, 'transport':'ssh', 'ssh_target':'research-server'}
        def fail(*args, stderr, **_):
            stderr.write(b'connection refused')
            return subprocess.CompletedProcess([],255)
        with patch('workspace_server.compute_environments.subprocess.run', side_effect=fail) as probe:
            with self.assertRaisesRegex(ValueError, 'connection refused'):
                self.environments.check(config, self.runs)
            self.assertEqual(probe.call_count, 1)
            self.assertEqual(probe.call_args.args[0][0], 'ssh')
        self.assertEqual(self.environments.snapshot().compute_transport, 'local')
        self.assertFalse(self.environments.path.exists())

    def test_invalid_host_and_interpreter_options_rejected(self):
        for change in ({'ssh_target':'-oProxyCommand=evil'}, {'ssh_target':'host;cat /secret'}, {'remote_python':'python; touch /tmp/bad'}, {'local_python':'-c code'}, {'ssh_port':True}, {'transport':'other'}):
            with self.assertRaises(ValueError): self.environments.validate({**self.environments.config, **change})

    def test_remote_python_quoted_and_strict_ssh_for_both_paths(self):
        config = {**self.environments.config, 'transport':'ssh', 'ssh_target':'research-server', 'remote_python':'/opt/fq env/bin/python'}
        from dataclasses import replace
        selected = replace(self.settings, compute_transport='ssh', ssh_target=config['ssh_target'], remote_python=config['remote_python'])
        command = self.runs.command('print(42)', settings=selected)
        self.assertIn("'/opt/fq env/bin/python'", command[-1]); self.assertIn('--', command)
        with patch('flagquantum_adapter.ssh_cpu.subprocess.run', return_value=subprocess.CompletedProcess([],0,'{"ok":true,"result":{}}','')) as run:
            SSHCPUAdapter('research-server', 22, config['remote_python']).execute({})
        command = run.call_args.args[0]
        self.assertIn("'/opt/fq env/bin/python'", command[-1]); self.assertIn('StrictHostKeyChecking=yes', command)

    def test_queued_circuit_keeps_original_adapter(self):
        entered, release = threading.Event(), threading.Event()
        original = Mock(transport='local')
        def execute(data):
            entered.set(); release.wait(5); return {'provider':'original'}
        original.execute.side_effect = execute
        replacement = Mock(transport='ssh')
        self.service.adapter = original
        first = self.service.submit({'source':SOURCE}); self.assertTrue(entered.wait(2))
        second = self.service.submit({'source':SOURCE})
        self.service.adapter = replacement; release.set(); self.service.pool.shutdown(wait=True)
        self.assertEqual(original.execute.call_count, 2); replacement.execute.assert_not_called()
        self.assertEqual(self.service.get_job(second['id'])['result']['transport'], 'local')

    def test_queued_python_keeps_interpreter_and_metadata(self):
        self.service.environments = self.environments
        entered, release = threading.Event(), threading.Event()
        blocker = self.runs.pool.submit(lambda: (entered.set(), release.wait(5)))
        self.assertTrue(entered.wait(2))
        run = self.runs.submit({'source':'print("retained environment")'})
        self.environments.config = {**self.environments.config, 'local_python':'/missing/changed-python'}
        release.set(); blocker.result()
        self.runs.pool.shutdown(wait=True)
        saved = self.runs.get(run['id'])
        self.assertEqual(saved['status'], 'completed', saved)
        self.assertEqual(saved['environment']['python'], sys.executable)
        self.assertIn('retained environment', ''.join(log['text'] for log in saved['logs']))

class IdentityCommandTests(unittest.TestCase):
    def test_identity_path_stays_an_argv_value_in_both_runners(self):
        from dataclasses import replace
        with tempfile.TemporaryDirectory() as directory:
            settings = WorkspaceSettings(Path(directory), Path(directory)/'jobs.sqlite3',
                ssh_target='research-server', ssh_identity='/tmp/research key;literal')
            store = SQLiteJobStore(settings.database_path); store.initialize()
            service = QuantumWorkspaceService(store, Mock())
            runs = PythonRuns(settings, service)
            try:
                command = runs.command('print(42)')
                self.assertEqual(command[command.index('-i') + 1], settings.ssh_identity)
                self.assertIn('StrictHostKeyChecking=yes', command)
                self.assertNotIn('ssh_identity', runs.environment())
                with patch('flagquantum_adapter.ssh_cpu.subprocess.run', return_value=subprocess.CompletedProcess([],0,'{"ok":true,"result":{}}','')) as execute:
                    SSHCPUAdapter(settings.ssh_target, 22, 'python3', settings.ssh_identity).execute({})
                command = execute.call_args.args[0]
                self.assertEqual(command[command.index('-i') + 1], settings.ssh_identity)
                self.assertIn('ForwardAgent=no', command)
                environments = ComputeEnvironments(settings)
                check = {'config':environments.config, 'revision':4}
                environments.path.write_text(json.dumps(check))
                self.assertEqual(ComputeEnvironments(settings).snapshot().ssh_identity, settings.ssh_identity)
                del check['config']['ssh_identity']
                environments.path.write_text(json.dumps(check))
                self.assertEqual(ComputeEnvironments(settings).snapshot().ssh_identity, '')
                with self.assertRaises(ValueError):
                    environments.validate({**environments.config, 'ssh_identity':'-invalid'})
            finally:
                runs.close(); service.close()


if __name__ == '__main__': unittest.main()
