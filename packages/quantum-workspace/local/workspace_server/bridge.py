"""Workspace-scoped action adapter. UI and native CLI tools share the service.
No Agent loop, arbitrary file access, or executable user code lives here.
"""
import hashlib
import json
import re
from contextlib import closing
import sqlite3
import threading
import time
import uuid
from .editor_files import create_model, read_model
from quantum_workspace_protocol import source_hash


class BridgeConflict(ValueError):
    pass


class WorkspaceBridge:
    def __init__(self, settings, service, python_runs=None):
        self.root = settings.agent_cwd or settings.web_root.parent
        self.service = service
        self.python_runs = python_runs
        self.path = settings.database_path.with_suffix('.bridge.sqlite3')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.contexts = {}
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS actions (seq INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT, session TEXT, request_id TEXT UNIQUE, payload TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, payload TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, fingerprint TEXT, outcome TEXT)')
            interrupted = db.execute('SELECT request_id,payload FROM actions').fetchall()
        for key, payload in interrupted:
            action = json.loads(payload)
            if action.get('status') == 'running':
                error = 'Local server restarted before the action outcome was recorded. Inspect existing programs and jobs before submitting another action.'
                self.settle(key, {**action, 'status': 'failed', 'error': error}, {'error': error})

    def context(self, client):
        with self.lock:
            value = self.contexts.get(client)
            if not value or time.time() - value['updated_at'] > 60:
                raise BridgeConflict('Workspace context expired. Open the Web workbench and try again.')
            return dict(value)

    def publish(self, data):
        client, session = self.identity(data)
        source = data.get('source')
        if not isinstance(source, str) or len(source.encode()) > 32768:
            raise ValueError('Workspace source must be at most 32 KiB.')
        name = data.get('name')
        if not isinstance(name, str) or not 0 < len(name) <= 200:
            raise ValueError('Invalid model name.')
        if data.get('page') not in ('model', 'synthesis', 'program', 'execution', 'jobs'):
            raise ValueError('Invalid workspace page.')
        if data.get('language') not in (None,'qasm','python'): raise ValueError('Invalid source language.')
        value = {key: data.get(key) for key in ('page', 'name', 'source', 'editorFile', 'selectedProgramId', 'selectedJobId', 'shots', 'seed', 'turnSeq', 'dirty', 'language')}
        value.update(client=client, session=session, source_hash=source_hash(source), updated_at=time.time())
        with self.lock:
            if client not in self.contexts and len(self.contexts) >= 64:
                expired = [key for key, item in self.contexts.items() if time.time() - item['updated_at'] > 60]
                for key in expired: self.contexts.pop(key, None)
                if len(self.contexts) >= 64: raise BridgeConflict('Too many active workbench clients.')
            self.contexts[client] = value
        return {'ready': True, 'source_hash': value['source_hash'], 'backend': self.service.health()}

    @staticmethod
    def identity(data):
        values = (data.get('client'), data.get('session'))
        if any(not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,128}', value) for value in values):
            raise ValueError('A valid workbench client and native session are required.')
        return values

    def events(self, client, session, after):
        self.identity({'client': client, 'session': session})
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            rows = db.execute('SELECT seq,payload FROM actions WHERE client=? AND session=? AND seq>? ORDER BY seq LIMIT 100', (client, session, after)).fetchall()
        return [{'seq': seq, **json.loads(payload)} for seq, payload in rows]

    def resource(self, resource_id):
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            row = db.execute('SELECT payload FROM resources WHERE id=?', (resource_id,)).fetchone()
        if not row: raise ValueError('Compiled program was not found. Compile the model first.')
        return json.loads(row[0])

    def act(self, data):
        client, session = self.identity(data)
        context = self.context(client)
        if context['session'] != session:
            raise BridgeConflict('The active native session changed. Refresh status before acting.')
        operation = data.get('operation')
        if operation == 'status':
            return {key: value for key, value in context.items() if key != 'source'} | {'backend': self.service.health()}
        if operation == 'draft.read':
            return {'name': context['name'], 'source': context['source'], 'source_hash': context['source_hash']}
        if operation == 'project.inspect':
            if not self.python_runs: raise ValueError('Python runtime unavailable.')
            return self.python_runs.projects.tree(data.get('project_id'))
        if operation == 'model.read': return read_model(self.root, data.get('model_id'))
        if operation == 'python.read':
            if not self.python_runs: raise ValueError('Python runtime unavailable.')
            run = self.python_runs.get(data.get('run_id'))
            if not run: raise ValueError('Python task not found.')
            return run
        if operation == 'experiment.read':
            result = self.python_runs.experiments.get(data.get('experiment_id')) if self.python_runs else None
            if not result: raise ValueError('Experiment not found.')
            return result
        if operation == 'job.read':
            result = self.service.get_job(data.get('job_id'))
            if not result and self.python_runs:
                result = (self.python_runs.experiments.get(data.get('job_id')) or {}).get('job')
            if not result: raise ValueError('Job not found.')
            return result
        if operation not in ('model.create', 'model.share', 'compile', 'run', 'focus', 'python.run', 'python.cancel', 'project.run'):
            raise ValueError('Unsupported workbench action.')
        key = data.get('request_id')
        if not isinstance(key, str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,128}', key):
            raise ValueError('A stable request_id is required for mutations.')
        fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            prior = db.execute('SELECT fingerprint,outcome FROM deliveries WHERE id=?', (key,)).fetchone()
            if prior:
                if prior[0] != fingerprint: raise BridgeConflict('Request ID already belongs to different input.')
                if not prior[1]: raise BridgeConflict('Action outcome is unresolved; inspect existing resources before retrying.')
                result = json.loads(prior[1])
                if 'error' in result: raise BridgeConflict(result['error'])
                return result
            db.execute('INSERT INTO deliveries VALUES (?,?,NULL)', (key, fingerprint))
            base = {'id': key, 'operation': operation, 'status': 'running', 'created_at': time.time(), 'turn_seq': context.get('turnSeq'), 'origin': 'ui' if data.get('origin') == 'ui' else 'agent'}
            db.execute('INSERT INTO actions (client,session,request_id,payload) VALUES (?,?,?,?)', (client, session, key, json.dumps(base)))
        try:
            result = self.execute(operation, data, context)
            final = {**base, 'status': 'completed', 'result': result}
        except Exception as error:
            result = {'error': str(error)[:2000]}
            final = {**base, 'status': 'failed', **result}
            self.settle(key, final, result)
            raise
        self.settle(key, final, result)
        return result

    def settle(self, key, final, result):
        # A new sequence makes settlement observable to clients that saw Running.
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            old = db.execute('SELECT client,session FROM actions WHERE request_id=?', (key,)).fetchone()
            db.execute('DELETE FROM actions WHERE request_id=?', (key,))
            db.execute('INSERT INTO actions (client,session,request_id,payload) VALUES (?,?,?,?)', (*old, key, json.dumps(final)))
            db.execute('UPDATE deliveries SET outcome=? WHERE id=?', (json.dumps(result), key))

    def execute(self, operation, data, context):
        if operation == 'project.run':
            if not self.python_runs: raise ValueError('Python runtime unavailable.')
            if data.get('origin') != 'ui' and not data.get('expected_hash'):
                raise BridgeConflict('Inspect the project snapshot hash before running it.')
            return {'python_run': self.python_runs.submit_project(data)}
        if operation in ('model.create', 'model.share'):
            source = context['source'] if operation == 'model.share' else data.get('source')
            if operation == 'model.share' and data.get('expected_hash') != context['source_hash']:
                raise BridgeConflict('The browser draft changed. Refresh status before sharing it.')
            language = context.get('language') or 'qasm' if operation == 'model.share' else data.get('language','qasm')
            file = create_model(self.root, source, language)
            return {'file': file, 'name': str(data.get('name') or context['name'])[:200], 'expected_name': context['name'], 'expected_source': context['source'], 'expected_link': context.get('editorFile')}
        if operation in ('python.run','python.cancel'):
            if not self.python_runs: raise ValueError('Python runtime unavailable.')
            if operation == 'python.cancel': return {'python_run':self.python_runs.cancel(data.get('run_id'))}
            if data.get('model_id'):
                model = read_model(self.root, data['model_id'])
                if not model['id'].endswith('.py') or model['revision'] != data.get('expected_revision'): raise BridgeConflict('Read the current Python model revision before running.')
                source = model['source']
            else: source = data.get('source')
            return {'python_run':self.python_runs.submit({'source':source,'name':data.get('name') or context['name']})}
        if operation == 'compile':
            if data.get('model_id'):
                model = read_model(self.root, data['model_id'])
                if not model['id'].endswith('.qasm'): raise ValueError('Use python.run for Python source.')
                if model['revision'] != data.get('expected_revision'):
                    raise BridgeConflict('Shared model revision changed. Read it again before compiling.')
                source = model['source']
            else: source = data.get('source')
            compiled = self.service.compile({'source': source})
            program = {'id': str(uuid.uuid4()), 'name': str(data.get('name') or context['name'])[:200], 'source': source, 'compiled': compiled, 'created': int(time.time()*1000)}
            with self.lock, closing(sqlite3.connect(self.path)) as db, db:
                db.execute('INSERT INTO resources VALUES (?,?)', (program['id'], json.dumps(program)))
            return {'program': program}
        if operation == 'run':
            program = self.resource(data['program_id']) if data.get('program_id') else None
            source = program['source'] if program else data.get('source')
            return {'job': self.service.submit({'source': source, 'shots': data.get('shots', 1024), 'seed': data.get('seed', 42), 'name': data.get('name') or (program['name'] if program else context['name'])})}
        if operation == 'focus':
            if data.get('page') not in ('model', 'program', 'execution', 'jobs'): raise ValueError('Invalid target page.')
            return {key: data.get(key) for key in ('page', 'program_id', 'job_id')}
