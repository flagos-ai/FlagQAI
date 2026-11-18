import unittest
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import test_api as fixtures
from workspace_server.config import WorkspaceSettings
from workspace_server.research_baseline import update_baseline


def sha(raw):
    return hashlib.sha256(raw).hexdigest()
from workspace_server.research_coordination import ResearchCoordination
from workspace_server.research_runs import read_research_run


class CoordinationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.settings = WorkspaceSettings(self.root, self.root / 'jobs.sqlite3')
        self.ids, self.sources = [], {}
        for name in ('a', 'b'):
            directory, report = fixtures.WorkspaceAPITests.saved_verifier_fixture(self, name * 32)
            identity = 'invsqrt-' + report['id']
            self.ids.append(identity)
            self.sources[identity] = (directory / 'candidate.kmx').read_bytes()

        self.team = ResearchCoordination(self.settings)
        self.act('open', 'open', constraints='At most 64 qubits; preserve the baseline.')

    def act(self, action, key, **values):
        return self.team.act('native-parent', {'action': action, 'request_id': key, **values})

    def reserve(self, name='width'):
        return self.act('reserve', 'reserve-' + name, task_id=name, task='Explore ' + name,
            expected_constraint_revision=1, expected_project_revision=0,
            parent_run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]]))

    def test_double_worker_claim_is_atomic_and_restart_never_reclaims(self):
        self.reserve('width'); self.reserve('cost')
        def claim(index):
            return self.act('claim', 'same-dispatch', task_id='width')['claimed']
        with ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(sum(pool.map(claim, range(4))), 1)
        self.team = ResearchCoordination(self.settings)
        self.assertFalse(self.act('claim', 'same-dispatch', task_id='width')['claimed'])
        self.assertFalse(self.act('claim', 'different-dispatch', task_id='width')['claimed'])
        state = self.team.read('native-parent')
        self.assertEqual(state['tasks']['width']['status'], 'admitting')
        self.assertEqual(state['tasks']['cost']['status'], 'reserved')
        self.assertIsNone(self.team.read('another-session'))

    def test_evidence_uses_actual_report_and_preserves_superseded_history(self):
        self.reserve()
        self.act('evidence', 'report', task_id='width', run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]]))
        run = read_research_run(self.settings, self.ids[0])
        task = run['coordination'][0]['task']
        self.assertEqual(task['evidence'][0]['metrics']['score'], 180)
        self.act('constraints', 'change', expected_constraint_revision=1, constraints='At most 48 qubits.')
        state = self.team.read('native-parent')
        self.assertFalse(state['tasks']['width']['constraints_current'])
        self.assertFalse(state['tasks']['width']['evidence'][0]['constraints_current'])
        self.assertEqual(state['history'][0]['constraints'], 'At most 64 qubits; preserve the baseline.')
        with self.assertRaisesRegex(ValueError, 'constraints changed'):
            self.act('claim', 'stale', task_id='width')
        with self.assertRaisesRegex(ValueError, 'constraints changed'):
            self.act('evidence', 'stale-report', task_id='width', run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]]))

    def test_rejects_foreign_source_and_tampered_evidence(self):
        self.reserve()
        with self.assertRaisesRegex(ValueError, 'does not belong'):
            self.act('evidence', 'foreign', task_id='width', run_id=self.ids[1], source_sha256=sha(self.sources[self.ids[1]]))
        (self.root / 'invsqrt' / ('a' * 32) / 'candidate.stdout.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            self.act('evidence', 'corrupt', task_id='width', run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]]))

    def test_failed_outcomes_and_owner_are_preserved(self):
        task = self.reserve()['coordination']['tasks']['width']
        self.act('claim', 'claim', task_id='width')
        self.act('observe', 'failed', task_id='width', worker_session_id=task['worker_session_id'], status='failed', detail='Verifier tool failed')
        self.act('observe', 'cold', task_id='width', worker_session_id=task['worker_session_id'], status='unknown')
        restored = ResearchCoordination(self.settings).read('native-parent')
        self.assertEqual(restored['tasks']['width']['status'], 'failed')
        self.assertEqual(restored['tasks']['width']['events'][0]['detail'], 'Verifier tool failed')
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            self.act('observe', 'wrong-worker', task_id='width', worker_session_id='another-worker', status='completed')

    def test_source_change_and_request_reuse_are_rejected(self):
        self.reserve()
        update_baseline(self.settings, self.ids[1], {
            'decision': 'adopt', 'request_id': 'new-baseline',
            'expected_project_revision': 0, 'source_sha256': sha(self.sources[self.ids[1]]),
        })
        with self.assertRaisesRegex(ValueError, 'baseline changed'):
            self.act('claim', 'dispatch', task_id='width')
        with self.assertRaisesRegex(ValueError, 'different input'):
            self.act('open', 'open', constraints='Other constraints')

    def tearDown(self):
        self.temp.cleanup()

    def test_independent_processes_cannot_reclaim_after_parent_restart(self):
        self.reserve('width'); self.reserve('cost')
        script = """
import json, sys
from pathlib import Path
from workspace_server.config import WorkspaceSettings
from workspace_server.research_coordination import ResearchCoordination
root = Path(sys.argv[1])
team = ResearchCoordination(WorkspaceSettings(root, root / 'jobs.sqlite3'))
print(json.dumps(team.act('native-parent', {'action': 'claim', 'request_id': sys.argv[2], 'task_id': 'width'})['claimed']))
"""
        def claim(index):
            return json.loads(subprocess.check_output(
                [sys.executable, '-c', script, str(self.root), 'process-' + str(index)],
                env={**os.environ,
                     'PYTHONPATH': str(Path(__file__).resolve().parents[1] / 'local')},
            ))
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sum(pool.map(claim, range(2))), 1)
        self.assertFalse(claim(2))
        restored = ResearchCoordination(self.settings).read('native-parent')
        self.assertEqual(restored['tasks']['width']['status'], 'admitting')
        self.assertEqual(restored['tasks']['cost']['status'], 'reserved')
        self.assertEqual(sum(event['action'] == 'claim' for event in restored['history']), 1)

    def test_retry_evidence_is_deduplicated_and_reports_remain_unchanged(self):
        self.reserve()
        root = self.root / 'invsqrt'
        before = {str(path.relative_to(root)): path.read_bytes()
                  for path in root.rglob('*') if path.is_file()}
        data = dict(task_id='width', run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]]))
        self.act('evidence', 'evidence-retry', **data)
        self.team = ResearchCoordination(self.settings)
        self.act('evidence', 'evidence-retry', **data)
        self.assertEqual(len(self.team.read('native-parent')['tasks']['width']['evidence']), 1)
        for name, raw in before.items():
            self.assertEqual((root / name).read_bytes(), raw)
        self.assertEqual(read_research_run(self.settings, self.ids[1])['coordination'], [])

    def test_invalid_requests_and_observation_before_claim_do_not_mutate_state(self):
        task = self.reserve()['coordination']['tasks']['width']
        before = self.team.read('native-parent')
        for data in (None, {'action': 'open', 'project_id': 'other'},
                     {'action': 'observe', 'request_id': 'early', 'task_id': 'width',
                      'worker_session_id': task['worker_session_id'], 'status': 'running'}):
            with self.assertRaises(ValueError):
                self.team.act('native-parent', data)
        self.assertEqual(self.team.read('native-parent'), before)

    def test_changed_verifier_cannot_be_dispatched_or_linked_as_task_evidence(self):
        self.reserve()
        directory = self.root / 'invsqrt' / ('a' * 32)
        report = json.loads((directory / 'report.json').read_text())
        code = b'raise AssertionError("different verifier")\n'
        (directory / 'verifier.py').write_bytes(code)
        report['provenance']['verifier_sha256'] = sha(code)
        next(item for item in report['exports'] if item['name'] == 'verifier.py')['sha256'] = sha(code)
        (directory / 'report.json').write_text(json.dumps(report))
        with self.assertRaisesRegex(ValueError, 'changed before dispatch'):
            self.act('claim', 'changed-verifier', task_id='width')
        with self.assertRaisesRegex(ValueError, 'changed before evidence'):
            self.act('evidence', 'changed-evidence', task_id='width',
                     run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]]))
        self.assertEqual(self.team.read('native-parent')['tasks']['width']['evidence'], [])

    def test_receipt_retry_preserves_failed_events_without_reopening_worker(self):
        task = self.reserve()['coordination']['tasks']['width']
        self.act('claim', 'dispatch', task_id='width')
        data = dict(task_id='width', worker_session_id=task['worker_session_id'],
                    status='failed', detail='Keep the tool failure')
        self.act('observe', 'settled', **data)
        self.team = ResearchCoordination(self.settings)
        self.act('observe', 'settled', **data)
        state = self.team.read('native-parent')
        self.assertEqual(state['tasks']['width']['status'], 'failed')
        self.assertEqual(len(state['tasks']['width']['events']), 1)
        self.assertFalse(self.act('claim', 'reclaim', task_id='width')['claimed'])

    def test_workbench_binding_owns_coordination_and_never_dispatches_compute(self):
        from unittest.mock import Mock
        from workspace_server.bridge import WorkspaceBridge, BridgeConflict
        compute = Mock()
        bridge = WorkspaceBridge(self.settings, compute)
        context = dict(client='test-client', session='native-parent', name='Unsaved study',
                       source='unsaved = True', page='model', dirty=True)
        bridge.publish(context)
        def action(operation, **data):
            return bridge.act(dict(client='test-client', session='native-parent', operation=operation, **data))
        source = action('research.inspect', parent=self.ids[0])
        action('research.coordinate', action='reserve', request_id='bridge-reserve', task_id='width',
               task='Explore width', expected_constraint_revision=1,
               expected_project_revision=source['project_revision'],
               source_sha256=source['source_sha256'], parent_run_id=source['parent'])
        state = action('research.coordinate', action='inspect')['coordination']
        self.assertEqual(state['coordinator_session_id'], 'native-parent')
        self.assertEqual(state['tasks']['width']['status'], 'reserved')
        with self.assertRaisesRegex(ValueError, 'Unsupported coordination action'):
            action('research.coordinate', action='dispatch', task_id='width', request_id='not-native')
        bridge.publish({**context, 'session': 'different-session'})
        with self.assertRaises(BridgeConflict):
            action('research.coordinate', action='inspect')
        self.assertEqual(compute.execute.call_count, 0)
        self.assertEqual(bridge.context('test-client')['source'], context['source'])
        self.assertTrue(bridge.context('test-client')['dirty'])
