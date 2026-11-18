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

    def change(self):
        return self.act('constraints', 'change', expected_constraint_revision=1, constraints='At most 48 qubits.')['coordination']

    def confirmation(self, plan, **values):
        return dict(action='confirm_plan', request_id='confirm-' + plan['id'], plan_id=plan['id'],
                    plan_sha256=plan['sha256'], expected_constraint_revision=plan['constraint_revision'], **values)

    def test_user_confirmation_is_required_idempotent_and_does_not_execute(self):
        self.reserve('width'); self.reserve('cost')
        state = self.change()
        plan = next(iter(state['adjustment_plans'].values()))
        self.assertEqual(plan['status'], 'proposed')
        self.assertEqual(len(state['tasks']), 2)
        with self.assertRaisesRegex(ValueError, 'explicit user review'):
            self.team.act('native-parent', self.confirmation(plan))
        with self.assertRaisesRegex(ValueError, 'user-confirmed'):
            self.act('reserve', 'bypass', task_id='bypass', expected_constraint_revision=2)
        def confirm(_): return self.team.act('native-parent', self.confirmation(plan), actor='user')
        with ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(confirm, range(3)))
        state = ResearchCoordination(self.settings).read('native-parent')
        self.assertEqual(len(state['tasks']), 4)
        self.assertEqual(state['adjustment_plans'][plan['id']]['status'], 'confirmed')
        new = [task for task in state['tasks'].values() if task.get('previous_task_id')]
        self.assertEqual({task['previous_task_id'] for task in new}, {'width', 'cost'})
        self.assertTrue(all(task['status'] == 'reserved' and task['constraint_revision'] == 2 and not task['events'] and not task['evidence'] for task in new))
        self.assertTrue(all(task['worker_session_id'] != state['tasks'][task['previous_task_id']]['worker_session_id'] for task in new))
        with self.assertRaisesRegex(ValueError, 'Earlier evidence remains historical'):
            self.act('evidence', 'reuse', task_id=new[0]['id'], run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]]))

    def test_stale_review_cannot_confirm_after_constraint_source_or_plan_change(self):
        self.reserve()
        plan = next(iter(self.change()['adjustment_plans'].values()))
        update_baseline(self.settings, self.ids[1], {
            'decision': 'adopt', 'request_id': 'updated-baseline',
            'expected_project_revision': 0, 'source_sha256': sha(self.sources[self.ids[1]]),
        })
        with self.assertRaisesRegex(ValueError, 'baseline changed'):
            self.team.act('native-parent', self.confirmation(plan), actor='user')
        with self.assertRaisesRegex(ValueError, 'version changed'):
            self.team.act('native-parent', {**self.confirmation(plan), 'plan_sha256': 'wrong'}, actor='user')
        state = self.act('recommend', 'fresh-plan', expected_constraint_revision=2,
            adjustments=[{'task_id': 'width', 'task': 'Prefer lower width over cost', 'reason': 'User prioritizes width'}])['coordination']
        with self.assertRaisesRegex(ValueError, 'plan changed'):
            self.team.act('native-parent', self.confirmation(plan), actor='user')
        current = next(item for item in state['adjustment_plans'].values() if item['status'] == 'proposed')
        self.act('constraints', 'changed-again', expected_constraint_revision=2, constraints='At most 40 qubits.')
        with self.assertRaisesRegex(ValueError, 'constraints changed'):
            self.team.act('native-parent', self.confirmation(current), actor='user')
        self.assertEqual(len(self.team.read('native-parent')['tasks']), 1)

    def test_rejection_and_failed_task_can_be_revised_without_erasing_history(self):
        old = self.reserve()['coordination']['tasks']['width']
        self.act('claim', 'started', task_id='width')
        self.act('observe', 'failed', task_id='width', worker_session_id=old['worker_session_id'], status='failed', detail='Retain this error')
        plan = next(iter(self.change()['adjustment_plans'].values()))
        self.team.act('native-parent', {**self.confirmation(plan), 'action': 'reject_plan'}, actor='user')
        self.assertEqual(len(self.team.read('native-parent')['tasks']), 1)
        state = self.act('recommend', 'retry-plan', expected_constraint_revision=2)['coordination']
        fresh = next(item for item in state['adjustment_plans'].values() if item['status'] == 'proposed')
        state = self.team.act('native-parent', self.confirmation(fresh), actor='user')['coordination']
        self.assertEqual(state['tasks']['width']['events'][0]['detail'], 'Retain this error')
        self.assertEqual(state['tasks']['width']['status'], 'failed')
        self.assertEqual(len(state['tasks']), 2)
        self.assertEqual(state['adjustment_plans'][plan['id']]['status'], 'rejected')

    def test_later_versions_retain_ancestor_evidence_without_inheriting_verification(self):
        self.reserve()
        self.act('evidence', 'old-report', task_id='width', run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]]))
        plan = next(iter(self.change()['adjustment_plans'].values()))
        first = self.team.act('native-parent', self.confirmation(plan), actor='user')['coordination']
        previous_id = plan['changes'][0]['task_id']
        later = self.act('constraints', 'third-constraints', expected_constraint_revision=2, constraints='At most 40 qubits.')['coordination']
        current = next(item for item in later['adjustment_plans'].values() if item['status'] == 'proposed')
        self.assertEqual(current['changes'][0]['previous_task_id'], previous_id)
        self.assertEqual(len(current['changes'][0]['previous_evidence']), 1)
        self.assertEqual(current['changes'][0]['source']['source_sha256'], first['tasks']['width']['source_sha256'])
        accepted = self.team.act('native-parent', self.confirmation(current), actor='user')['coordination']
        new = accepted['tasks'][current['changes'][0]['task_id']]
        self.assertEqual(new['task_version'], 3)
        self.assertEqual(new['evidence'], [])
        self.assertEqual(accepted['tasks']['width']['evidence'][0]['run_id'], self.ids[0])

    def test_web_review_is_record_bound_and_does_not_expose_dispatch(self):
        import json
        import threading
        from urllib.request import Request, urlopen
        from urllib.error import HTTPError
        from workspace_server.config import WorkspaceSettings
        from workspace_server.http import create_server
        from workspace_server.job_store import SQLiteJobStore
        from workspace_server.service import QuantumWorkspaceService
        import test_bridge as bridge_fixture
        self.reserve('width'); self.reserve('cost')
        plan = next(iter(self.change()['adjustment_plans'].values()))
        settings = WorkspaceSettings(self.root, self.settings.database_path, port=0, agent_cwd=self.root)
        store = SQLiteJobStore(settings.database_path); store.initialize()
        compute = bridge_fixture.ScriptedCPU()
        service = QuantumWorkspaceService(store, compute)
        server = create_server(settings, service)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        base = 'http://127.0.0.1:' + str(server.server_port)
        def post(data):
            request = Request(base + '/api/research-runs/' + self.ids[0] + '/coordination',
                data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
            with urlopen(request) as response: return json.load(response)
        try:
            with self.assertRaises(HTTPError) as problem:
                post({**self.confirmation(plan), 'coordinator_session_id': 'foreign'})
            self.assertEqual(problem.exception.code, 409)
            with self.assertRaises(HTTPError):
                post({'action': 'dispatch', 'coordinator_session_id': 'native-parent', 'task_id': 'width'})
            accepted = post({**self.confirmation(plan), 'coordinator_session_id': 'native-parent'})
            self.assertEqual(len(accepted['coordination']['tasks']), 4)
            self.assertEqual(compute.calls, [])
            with urlopen(base + '/api/research-runs/' + self.ids[0]) as response: run = json.load(response)['run']
            self.assertEqual(len(run['coordination_projects'][0]['tasks']), 4)
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=5); service.close()

    def test_constraint_changes_before_first_task_do_not_require_nonexistent_review(self):
        owner = 'empty-project-owner'
        self.team.act(owner, dict(action='open', request_id='open', constraints='Initial limits'))
        self.team.act(owner, dict(action='constraints', request_id='revise',
                                 expected_constraint_revision=1, constraints='Revised initial limits'))
        for task in ('width', 'cost'):
            self.team.act(owner, dict(action='reserve', request_id='reserve-' + task, task_id=task,
                task='Explore ' + task, expected_constraint_revision=2, expected_project_revision=0,
                parent_run_id=self.ids[0], source_sha256=sha(self.sources[self.ids[0]])))
        state = self.team.read(owner)
        self.assertEqual(len(state['tasks']), 2)
        self.assertEqual(state['adjustment_plans'], {})
        self.assertTrue(all(task['constraints_current'] for task in state['tasks'].values()))

    def test_adjusted_task_requires_a_new_report_after_confirmation(self):
        import shutil
        from datetime import datetime, timezone
        self.reserve()
        self.act('evidence', 'old-report', task_id='width', run_id=self.ids[0],
                 source_sha256=sha(self.sources[self.ids[0]]))
        plan = next(iter(self.change()['adjustment_plans'].values()))
        self.team.act('native-parent', self.confirmation(plan), actor='user')
        identity = 'c' * 32
        directory = self.root / 'invsqrt' / identity
        shutil.copytree(self.root / 'invsqrt' / ('a' * 32), directory)
        report = json.loads((directory / 'report.json').read_text())
        report['id'] = identity
        (directory / 'report.json').write_text(json.dumps(report))
        task_id = plan['changes'][0]['task_id']
        evidence = dict(task_id=task_id, run_id='invsqrt-' + identity,
                        source_sha256=sha(self.sources[self.ids[0]]))
        with self.assertRaisesRegex(ValueError, 'predates adjustment confirmation'):
            self.act('evidence', 'dated-report', **evidence)
        report['created_at'] = datetime.now(timezone.utc).isoformat()
        (directory / 'report.json').write_text(json.dumps(report))
        self.act('evidence', 'dated-report', **evidence)
        self.team = ResearchCoordination(self.settings)
        self.act('evidence', 'dated-report', **evidence)
        state = self.team.read('native-parent')
        self.assertEqual(len(state['tasks'][task_id]['evidence']), 1)
        self.assertTrue(state['tasks'][task_id]['evidence'][0]['constraints_current'])
        self.assertFalse(state['tasks']['width']['evidence'][0]['constraints_current'])
        self.assertEqual(state['tasks']['width']['evidence'][0]['run_id'], self.ids[0])

    def test_legacy_receipts_project_the_additive_review_schema_after_reopen(self):
        import sqlite3
        with sqlite3.connect(self.team.path) as db:
            row = db.execute('SELECT result FROM receipts WHERE owner=? AND request=?',
                             ('native-parent', 'open')).fetchone()
            receipt = json.loads(row[0])
            receipt['coordination'].pop('adjustment_plans', None)
            db.execute('UPDATE receipts SET result=? WHERE owner=? AND request=?',
                       (json.dumps(receipt), 'native-parent', 'open'))
        self.team = ResearchCoordination(self.settings)
        replay = self.act('open', 'open', constraints='At most 64 qubits; preserve the baseline.')
        self.assertEqual(replay['coordination']['adjustment_plans'], {})
        self.assertEqual(self.team.read('native-parent')['tasks'], {})
