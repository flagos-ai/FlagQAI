"""Durable research task metadata; native Harness owns all worker execution."""
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import re
import sqlite3
import uuid

from .invsqrt_evidence import read_report_export
from .research_candidates import archived_report, candidate_source, digest
from .research_baseline import project_baseline, research_control_lock, valid_hash, verified_version


def _text(value, name, limit=4000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError('Invalid ' + name + '.')
    return value


def _id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,128}', value):
        raise ValueError('Invalid coordination identity.')
    return value


def _hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def _task(identity, text, state, source, **lineage):
    return {'id': identity, 'worker_session_id': str(uuid.uuid4()), 'task': text,
            'constraint_revision': state['constraint_revision'], 'constraints': state['constraints'],
            'parent_run_id': source['parent'], 'source_sha256': source['source_sha256'],
            'project_revision': source['project_revision'], 'verifier_sha256': source['verifier_sha256'],
            'status': 'reserved', 'evidence': [], 'events': [], **lineage}


def source_snapshot(settings, identity):
    report = archived_report(settings, identity)
    if report['status'] != 'completed':
        raise ValueError('Choose a fully verified task source.')
    raw = candidate_source(settings, report)
    state = project_baseline(settings)
    provenance = report.get('provenance') or {}
    verifier = provenance.get('verifier_sha256')
    if not valid_hash(verifier) or digest(read_report_export(settings, report, 'verifier.py')) != verifier:
        raise ValueError('The task source needs an archived verifier identity.')
    return {'parent': identity, 'source_sha256': digest(raw),
            'project_revision': state['revision'], 'verifier_sha256': verifier}


class ResearchCoordination:
    def __init__(self, settings):
        self.settings = settings
        self.path = settings.database_path.parent / 'research-coordination.sqlite3'
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS projects (owner TEXT, project TEXT, payload TEXT, PRIMARY KEY(owner, project))')
            db.execute('CREATE TABLE IF NOT EXISTS receipts (owner TEXT, project TEXT, request TEXT, fingerprint TEXT, result TEXT, PRIMARY KEY(owner,project,request))')

    def read(self, owner, project='study-invsqrt'):
        _id(owner); _id(project)
        with closing(sqlite3.connect(self.path)) as db:
            row = db.execute('SELECT payload FROM projects WHERE owner=? AND project=?', (owner, project)).fetchone()
        return self.view(json.loads(row[0])) if row else None

    @staticmethod
    def view(state):
        result = json.loads(json.dumps(state))
        for task in result['tasks'].values():
            task['constraints_current'] = task['constraint_revision'] == result['constraint_revision']
            for evidence in task['evidence']:
                evidence['constraints_current'] = task['constraints_current']
        return result

    def for_run(self, identity):
        with closing(sqlite3.connect(self.path)) as db:
            rows = db.execute('SELECT payload FROM projects ORDER BY owner,project').fetchall()
        return [dict(project_id=state['project_id'], coordinator_session_id=state['coordinator_session_id'],
                     constraint_revision=state['constraint_revision'], task=task)
                for row in rows for state in [self.view(json.loads(row[0]))]
                for task in state['tasks'].values()
                if task['parent_run_id'] == identity or any(e['run_id'] == identity for e in task['evidence'])]

    def act(self, owner, data, *, actor='agent'):
        _id(owner)
        if not isinstance(data, dict):
            raise ValueError('Use a coordination request object.')
        if actor not in ('agent', 'user'):
            raise ValueError('Invalid coordination actor.')
        project = _id(data.get('project_id', 'study-invsqrt'))
        # The first evidence adapter is InvSqrt; other projects must supply their own source adapter.
        if project != 'study-invsqrt':
            raise ValueError('No research source adapter is registered for this project.')
        operation = data.get('action')
        if operation == 'inspect':
            return {'coordination': self.read(owner, project)}
        key = _id(data.get('request_id'))
        fingerprint = _hash({'actor': actor, 'data': data})
        with research_control_lock(self.settings), closing(sqlite3.connect(self.path, timeout=30)) as db, db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT fingerprint,result FROM receipts WHERE owner=? AND project=? AND request=?', (owner, project, key)).fetchone()
            if prior:
                if prior[0] != fingerprint:
                    raise ValueError('Coordination request ID belongs to different input.')
                result = json.loads(prior[1])
                if operation == 'claim': result['claimed'] = False
                return result
            row = db.execute('SELECT payload FROM projects WHERE owner=? AND project=?', (owner, project)).fetchone()
            state = json.loads(row[0]) if row else None
            if operation == 'open':
                if state:
                    raise ValueError('Project coordination already exists; inspect it first.')
                state = {'schema': 1, 'project_id': project, 'coordinator_session_id': owner,
                         'constraint_revision': 1, 'constraints': _text(data.get('constraints'), 'constraints'),
                         'tasks': {}, 'history': []}
            elif not state:
                raise ValueError('Open project coordination first.')
            elif operation == 'constraints':
                self.check_revision(state, data)
                constraints = _text(data.get('constraints'), 'constraints')
                if constraints == state['constraints']: raise ValueError('Project constraints have not changed.')
                state['constraints'] = constraints
                state['constraint_revision'] += 1
            elif operation == 'reserve':
                self.check_revision(state, data)
                task_id = _id(data.get('task_id'))
                if task_id in state['tasks']:
                    raise ValueError('Task ID already exists. Inspect it instead of dispatching again.')
                source = source_snapshot(self.settings, data.get('parent_run_id'))
                if source['source_sha256'] != data.get('source_sha256') or source['project_revision'] != data.get('expected_project_revision'):
                    raise ValueError('Research source or project baseline changed. Inspect it again.')
                if len(state['tasks']) >= 100:
                    raise ValueError('Project task limit reached.')
                state['tasks'][task_id] = _task(task_id, _text(data.get('task'), 'task'), state, source,
                                              lineage_id=task_id, task_version=1)
            elif operation in ('claim', 'observe', 'evidence'):
                task = state['tasks'].get(_id(data.get('task_id')))
                if not task:
                    raise ValueError('Unknown project task.')
                if operation == 'claim':
                    self.check_revision(state, {'expected_constraint_revision': task['constraint_revision']})
                    source = source_snapshot(self.settings, task['parent_run_id'])
                    if source['source_sha256'] != task['source_sha256'] or source['project_revision'] != task['project_revision'] or source['verifier_sha256'] != task['verifier_sha256']:
                        raise ValueError('Task source or project baseline changed before dispatch.')
                    # A claim is never replayed as permission to launch a second native activation.
                    if task['status'] != 'reserved':
                        return {'coordination': self.view(state), 'claimed': False}
                    task['status'] = 'admitting'
                    task['dispatch_id'] = key
                elif operation == 'observe':
                    if data.get('worker_session_id') != task['worker_session_id']:
                        raise ValueError('Native worker identity mismatch.')
                    status = data.get('status')
                    if status not in ('running', 'completed', 'failed', 'interrupted', 'unknown'):
                        raise ValueError('Invalid native worker status.')
                    if task['status'] == 'reserved':
                        raise ValueError('Worker dispatch has not been claimed.')
                    # Observation of a cold catalog never erases a known terminal outcome.
                    if task['status'] not in ('completed', 'failed'):
                        task['status'] = status
                    task['events'].append({'status': status, 'detail': str(data.get('detail', ''))[:4096],
                                           'native_run_id': str(data.get('native_run_id', ''))[:128],
                                           'at': datetime.now(timezone.utc).isoformat()})
                else:
                    self.check_revision(state, {'expected_constraint_revision': task['constraint_revision']})
                    source = source_snapshot(self.settings, task['parent_run_id'])
                    if source['source_sha256'] != task['source_sha256'] or source['project_revision'] != task['project_revision'] or source['verifier_sha256'] != task['verifier_sha256']:
                        raise ValueError('Task source or project baseline changed before evidence was linked.')
                    version = verified_version(self.settings, data.get('run_id'))
                    if version['source_sha256'] != data.get('source_sha256'):
                        raise ValueError('Evidence code version changed.')
                    report = archived_report(self.settings, version['run_id'])
                    if source_snapshot(self.settings, version['run_id'])['verifier_sha256'] != task['verifier_sha256']:
                        raise ValueError('Evidence uses a different verifier version.')
                    if version['source_sha256'] != task['source_sha256']:
                        # A new candidate must descend from this exact archived source.
                        parent = (report.get('proposal') or {}).get('parent')
                        if parent != task['parent_run_id'] or source_snapshot(self.settings, parent)['source_sha256'] != task['source_sha256']:
                            raise ValueError('Evidence does not belong to this task source.')
                    task['evidence'].append({**version, 'constraint_revision': task['constraint_revision']})
            else:
                raise ValueError('Unsupported coordination action.')
            state['history'].append({'action': operation, 'request_id': key, 'task_id': data.get('task_id'),
                'constraint_revision': state['constraint_revision'], 'constraints': state['constraints'], 'actor': actor,
                'at': datetime.now(timezone.utc).isoformat()})
            raw = json.dumps(state)
            if len(raw.encode()) > 2 * 1024 * 1024:
                raise ValueError('Project coordination storage limit reached.')
            result = {'coordination': self.view(state)}
            if operation == 'claim': result['claimed'] = True
            db.execute('INSERT OR REPLACE INTO projects VALUES (?,?,?)', (owner, project, raw))
            db.execute('INSERT INTO receipts VALUES (?,?,?,?,?)', (owner, project, key, fingerprint, json.dumps(result)))
            return result

    @staticmethod
    def check_revision(state, data):
        revision = data.get('expected_constraint_revision')
        if type(revision) is not int or revision != state['constraint_revision']:
            raise ValueError('Project constraints changed. Inspect the project and create a new task revision.')
