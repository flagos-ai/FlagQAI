"""Explicit simulator profiles; hardware and unsupported distribution fail closed."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'local'))
from workspace_server.config import WorkspaceSettings
from workspace_server.compute_environments import ComputeEnvironments
from workspace_server.execution_profiles import ExecutionProfiles, DEFAULT_PROFILE, validate_profile

class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); root = Path(self.temp.name)
        self.environments = ComputeEnvironments(WorkspaceSettings(root,root/'jobs.sqlite3',compute_transport='local',local_python=sys.executable))
        self.profiles = ExecutionProfiles(self.environments)
        self.capabilities = {'schema':'flagqai.execution-capabilities.v1','sdk_version':'fixture',
            'devices':[{'id':'cpu','methods':[{'id':'statevector','available':True},{'id':'mps','available':True},{'id':'stabilizer','available':False,'reason':'optional dependency missing'}]}]}

    def tearDown(self): self.temp.cleanup()

    def check(self):
        result = subprocess.CompletedProcess([],0,json.dumps(self.capabilities),'')
        def emit(*args, stdout, **kwargs):
            stdout.write(result.stdout.encode())
            return result
        with patch('workspace_server.execution_profiles.subprocess.run',side_effect=emit):
            return self.profiles.discover(Mock())

    def apply(self, method='mps', **changes):
        return self.profiles.activate({'profile':{**DEFAULT_PROFILE,'method':method,**changes},'expected_revision':self.profiles.revision,'environment_revision':self.environments.revision})

    def test_check_then_apply_persist_restore_and_snapshot_queued_adapter(self):
        with self.assertRaisesRegex(ValueError,'Check capabilities'):self.apply()
        self.check(); self.apply()
        adapter, environment = self.profiles.binding()
        self.apply('statevector')
        adapter.adapter = Mock(transport='local')
        adapter.execute({'operation':'run'})
        self.assertEqual(adapter.adapter.execute.call_args.args[0]['execution']['method'],'mps')
        self.assertEqual(environment['execution']['method'],'mps')
        self.assertEqual(ExecutionProfiles(self.environments).profile['method'],'statevector')

    def test_cannot_apply_unchecked_device_or_missing_method_dependency(self):
        self.check()
        for changes in ({'method':'stabilizer'},{'device':'cuda:0'}):
            with self.assertRaisesRegex(ValueError,'did not pass'):self.apply(**changes)
        self.assertEqual(self.profiles.profile,DEFAULT_PROFILE)

    def test_environment_change_rejects_probe_apply_and_execution_until_rechecked(self):
        self.check(); self.apply()
        self.environments.revision += 1
        self.assertTrue(self.profiles.describe()['stale'])
        self.assertIsNone(self.profiles.describe()['capabilities'])
        with self.assertRaisesRegex(ValueError,'environment changed'):self.profiles.binding()
        with self.assertRaisesRegex(ValueError,'Check capabilities'):self.apply()
        self.check();self.apply();self.assertFalse(self.profiles.describe()['stale'])

    def test_stale_window_and_expired_probe_cannot_activate(self):
        self.check()
        with self.assertRaisesRegex(ValueError,'another window'):
            self.profiles.activate({'profile':DEFAULT_PROFILE,'expected_revision':-1,'environment_revision':0})
        self.profiles.checked_at = time.monotonic() - 601
        with self.assertRaisesRegex(ValueError,'Check capabilities'):self.apply()

    def test_hardware_and_multi_node_never_substitute_simulator(self):
        for changes in ({'target':'hardware'},{'scale':'multi_node'},{'scale':'multi_device'},{'method':'dynamics'},{'method':'pauli_propagation'}):
            with self.assertRaises(ValueError):validate_profile({**DEFAULT_PROFILE,**changes})

    def test_environment_switch_during_probe_refuses_old_report(self):
        def response(*args,**kwargs):
            self.environments.revision += 1
            kwargs['stdout'].write(json.dumps(self.capabilities).encode())
            return subprocess.CompletedProcess([],0)
        with patch('workspace_server.execution_profiles.subprocess.run',side_effect=response):
            with self.assertRaisesRegex(ValueError,'during the check'):self.profiles.discover(Mock())
        self.assertIsNone(self.profiles.report)

if __name__=='__main__':unittest.main()
