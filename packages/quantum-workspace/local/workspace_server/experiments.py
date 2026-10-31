"""Same-origin FQX imports and durable recorded results, independent of compute."""
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import uuid

from quantum_workspace_protocol import source_hash
from .job_store import SQLiteJobStore

MAX_UPLOAD_BYTES = 16 * 1024 * 1024


class ExperimentImports:
    def __init__(self, settings):
        self.settings = settings
        self.root = settings.database_path.parent / 'experiments'
        self.root.mkdir(parents=True, exist_ok=True)
        self.store = SQLiteJobStore(settings.database_path.with_suffix('.experiments.sqlite3'))
        self.store.initialize()

    def records(self):
        return self.store.list()

    def get(self, identity):
        if not isinstance(identity, str) or not re.fullmatch(r'fqx-[a-f0-9]{32}', identity):
            return None
        return self.store.get(identity)

    def file(self, identity):
        if not self.get(identity):
            raise FileNotFoundError('Experiment not found.')
        return self.root / (identity + '.fqx')

    def import_file(self, data, filename, python_run=None, task_path=None):
        if not data or len(data) > MAX_UPLOAD_BYTES:
            raise ValueError('Upload an .fqx experiment no larger than 16 MiB.')
        filename = Path(filename).name[:160]
        if not filename.lower().endswith('.fqx'):
            raise ValueError('Select a .fqx experiment file.')
        identity = 'fqx-' + uuid.uuid4().hex
        with tempfile.TemporaryDirectory(prefix='.fqx-import-', dir=self.root) as folder:
            path = Path(folder) / 'input.fqx'
            path.write_bytes(data)
            worker = Path(__file__).with_name('experiment_worker.py')
            python = self.settings.experiment_python or self.settings.local_python or sys.executable
            try:
                with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
                    process = subprocess.run([python, str(worker), str(path)], stdout=output, stderr=errors,
                                             timeout=45, env={**os.environ, 'OMP_NUM_THREADS': '1'})
                    output.seek(0)
                    raw = output.read(2 * 1024 * 1024 + 4096)
                    if len(raw) > 2 * 1024 * 1024:
                        raise ValueError('Experiment preview exceeds 2 MiB.')
                    try:
                        payload = json.loads(raw)
                    except ValueError:
                        raise ValueError('Cannot read this experiment. Configure FQ_EXPERIMENT_PYTHON with FlagQuantum fq.load support.')
            except subprocess.TimeoutExpired:
                raise ValueError('Experiment import timed out; no computation was submitted.')
            if process.returncode or not payload.get('ok'):
                raise ValueError(payload.get('error', 'The SDK could not load this experiment.'))
            projected = payload['data']
            imported = int(time.time() * 1000)
            source = projected['source']
            info = {**projected['experiment'], 'id': identity, 'filename': filename,
                    'sha256': sha256(data).hexdigest(), 'imported_at': imported}
            compiled = {**projected['compiled'], 'source_hash': source_hash(source)}
            program = {'id': identity, 'name': filename[:-4], 'source': source,
                       'compiled': compiled, 'created': imported, 'experiment': info}
            if python_run is not None:
                origin = {'language': 'python', 'source': python_run['source'],
                          'run_id': python_run['id'], 'source_hash': source_hash(python_run['source']),
                          'execution_status': python_run['execution_status']}
                if python_run.get('project'): origin['project'] = python_run['project']
                program['origin'] = origin
                info['python_run'] = {'id': python_run['id'], 'source_hash': origin['source_hash'],
                                      'execution_status': origin['execution_status'],
                                      'transport': python_run['environment']['transport'], 'task_path': task_path,
                                      'elapsed_seconds': python_run.get('elapsed_seconds'),
                                      'sdk_version': python_run.get('runtime', {}).get('sdk_version')}
            if python_run is not None and python_run.get('project'): info['python_run']['project'] = python_run['project']
            record = {'id': identity, 'status': 'imported', 'program': program}
            if info['has_result']:
                counts = next((m['batches'][0] for m in info['measurements'] if m.get('batches')), [])
                values = {(r['state'] + ' (integer)' if r['key_type'] == 'integer' else r['state']): r['count'] for r in counts}
                shots = sum(values.values())
                plan = info.get('execution_plan') or {}
                options = plan.get('resolved_options') or {}
                record['job'] = {'id': identity, 'name': program['name'], 'status': 'completed',
                                 'experiment': info, 'request': {'source': source, 'shots': shots, 'seed': options.get('seed')},
                                 'result': {**compiled, 'counts': values, 'shots': shots, 'seed': options.get('seed'),
                                            'elapsed_seconds': None}}
            if record.get('job') and program.get('origin'):
                record['job']['origin'] = program['origin']
            destination = self.root / (identity + '.fqx')
            path.replace(destination)
            try:
                self.store.put(record)
            except Exception:
                destination.unlink(missing_ok=True)
                raise
            return record
