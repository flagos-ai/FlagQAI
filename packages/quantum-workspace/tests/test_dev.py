"""Launcher readiness and process ownership; no model calls or SSH needed."""
import importlib.util
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('workspace_dev', Path(__file__).resolve().parents[1] / 'dev.py')
dev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dev)

class LauncherTests(unittest.TestCase):
    def test_editor_only_start_reports_missing_compute_without_starting_an_agent(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / 'assets').mkdir(); (root / 'assets/app.mjs').write_text('')
            settings = dev.WorkspaceSettings(root, root / 'jobs', compute_transport='ssh')
            with patch.object(dev, 'agent_status', side_effect=AssertionError('Agent probe disabled')), patch.object(dev, 'sdk_status', return_value=None):
                checks = dev.preflight(settings, no_agent=True)
            self.assertFalse(any(level == 'ERROR' for level, _ in checks))
            self.assertTrue(any(level == 'WARN' and 'FQ_SSH_TARGET' in text for level, text in checks))
            self.assertTrue(any('FQ_EXPERIMENT_PYTHON' in text for _, text in checks))
    def test_missing_build_and_unrelated_agent_listener_are_explicit_errors(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); settings=dev.WorkspaceSettings(root, root/'jobs')
            with patch.object(dev, 'agent_status', return_value='invalid'), patch.object(dev, 'sdk_status', return_value=None), patch.object(dev.subprocess, 'check_output', return_value='v24.0.0'):
                errors=[text for level,text in dev.preflight(settings) if level=='ERROR']
            self.assertTrue(any('Web assets missing' in text for text in errors))
            self.assertTrue(any('will not be replaced' in text for text in errors))
    def test_remote_interpreter_and_probe_are_single_quoted_shell_arguments(self):
        interpreter='/opt/python env/bin/python; echo unsafe'
        command=['ssh','user@example.invalid']
        result=Mock(stdout='{"version":"0.4.0","save_load":true}\n')
        with patch.object(dev.subprocess, 'run', return_value=result) as run:
            self.assertIn('save/load ready',dev.sdk_status(command,remote_python=interpreter))
        invocation=run.call_args.args[0]
        self.assertEqual(invocation[:2],command)
        words=shlex.split(invocation[2])
        self.assertEqual(words[0],interpreter)
        self.assertEqual(words[1],'-c')
        self.assertIn('import json,flagquantum',words[2])
    def test_cleanup_only_terminates_owned_running_children(self):
        running=Mock(pid=10001); running.poll.return_value=None
        exited=Mock(pid=10002); exited.poll.return_value=0
        with patch.object(dev.os, 'killpg', create=True) as killpg:
            dev.stop_owned([running,exited])
            if dev.os.name == 'posix': killpg.assert_called_once_with(10001,dev.signal.SIGTERM)
            else: running.terminate.assert_called_once()
        exited.terminate.assert_not_called()
        stuck=Mock(pid=10003); stuck.poll.return_value=None
        stuck.wait.side_effect=[subprocess.TimeoutExpired('test',5),0]
        with patch.object(dev.os,'killpg',create=True) as killpg:
            dev.stop_owned([stuck])
            if dev.os.name == 'posix': self.assertEqual(killpg.call_args.args,(10003,dev.signal.SIGKILL))
            else: stuck.kill.assert_called_once()
    def test_invalid_ports_are_rejected(self):
        for value in [0,65536,-1]:
            with self.assertRaises(ValueError):dev.port(value)
        self.assertEqual(dev.port('4188'),4188)
