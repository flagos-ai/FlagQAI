"""Single-file Python task service with bounded logs, cancellation and SDK artifacts."""
import ast
import base64
import hashlib
import stat
from concurrent.futures import ThreadPoolExecutor
import json
import math
import re
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
import tempfile
import uuid
from .job_store import SQLiteJobStore
from .experiments import ExperimentImports
from .python_artifacts import ExperimentTransfer
from .projects import Projects, manifest_hash
from quantum_workspace_protocol import source_hash


def collection_error(run, filename, message):
    errors = run.setdefault('collection_errors', [])
    if len(errors) < 32:
        errors.append({'filename': filename, 'message': str(message)[:1000]})
    elif len(errors) == 32:
        errors.append({'filename': '', 'message': 'Further collection errors were omitted.'})


class PythonRuns:
    def __init__(self, settings, quantum_service, experiments=None):
        self.settings = settings
        self.quantum = quantum_service
        self.experiments = experiments or ExperimentImports(settings)
        self.store = SQLiteJobStore(settings.database_path.with_suffix('.python.sqlite3'))
        self.store.initialize()
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.lock = threading.RLock()
        self.active = {}
        self.recollecting = set()
        self.projects = Projects(settings)

    @staticmethod
    def validate(source):
        if not isinstance(source, str) or not 0 < len(source.encode()) <= 32768:
            raise ValueError('Python source must be between 1 byte and 32 KiB.')
        try: ast.parse(source, filename='main.py')
        except SyntaxError as error:
            return {'message':error.msg, 'line':error.lineno or 1, 'column':error.offset or 1}
        return None

    def environment(self):
        return {'transport':self.settings.compute_transport, 'timeout_seconds':90,
            'python':self.settings.local_python or sys.executable if self.settings.compute_transport == 'local' else self.settings.remote_python or 'Remote python3',
            'scope':'Single-file task in a temporary working directory'}

    def submit_project(self, data):
        bundle = self.projects.snapshot(data.get('project_id'), data.get('entry'),
            source=data.get('source'), expected_revision=data.get('expected_revision'), expected_hash=data.get('expected_hash'))
        return self.submit({'source': bundle['files'][bundle['entry']],
                            'name': data.get('name') or bundle['entry']}, bundle=bundle)

    def submit(self, data, bundle=None):
        diagnostic = self.validate(data.get('source'))
        # The selected runtime is authoritative for syntax (it may be newer than the host).
        with self.lock:
            if len(self.active) >= 4: raise ValueError('Python queue full. Wait for a task to finish.')
            run = {'id':str(uuid.uuid4()), 'name':str(data.get('name') or 'Python task')[:100],
                'source':data['source'], 'source_hash':source_hash(data['source']), 'status':'queued', 'created_at':time.time(), 'logs':[],
                'experiments':[], 'collection_errors':[], 'collection_status':'pending',
                'environment':self.environment()}
            if bundle is not None:
                run['project'] = bundle['project']
                inputs = self.settings.database_path.parent / 'python-inputs'
                inputs.mkdir(parents=True, exist_ok=True)
                (inputs / (run['id'] + '.json')).write_text(json.dumps({'entry': bundle['entry'], 'files': bundle['files']}))
            cancel = threading.Event()
            self.active[run['id']] = cancel
            self.store.put(run)
            self.pool.submit(self.execute, run, cancel)
        return run

    def get(self, run_id):
        return self.store.get(run_id)

    def cancel(self, run_id):
        with self.lock:
            if run_id in self.active: self.active[run_id].set()
        result = self.get(run_id)
        if not result: raise ValueError('Python task not found.')
        return result

    def collection_file(self, run_id, file_id):
        if not isinstance(file_id, str) or not re.fullmatch('[a-f0-9]{64}', file_id):
            raise FileNotFoundError('Saved task file not found.')
        run = self.get(run_id)
        if not run or not any(item.get('file_id') == file_id for item in run.get('collection_errors', [])):
            raise FileNotFoundError('Saved task file not found.')
        return self.settings.database_path.parent / 'python-artifacts' / run['id'] / (file_id + '.fqx')

    def recollect(self, run_id):
        """Retry retained preview files only; never execute Python again."""
        with self.lock:
            run = self.get(run_id)
            if not run: raise ValueError('Python task not found.')
            if run_id in self.active or run_id in self.recollecting:
                raise ValueError('Wait for execution or collection to finish.')
            retained = [item for item in run.get('collection_errors', []) if item.get('file_id')]
            if not retained: raise ValueError('No complete retained files can be retried. Import an existing .fqx file or rerun the script.')
            self.recollecting.add(run_id)
            previous_status = run.get('collection_status', 'failed')
        try:
            errors = [item for item in run['collection_errors'] if not item.get('file_id')]
            run['collection_status'] = 'collecting'
            self.store.put(run)
            for item in retained:
                try:
                    path = self.collection_file(run_id, item['file_id'])
                    if not stat.S_ISREG(path.lstat().st_mode) or path.stat().st_size > 16 * 1024 * 1024:
                        raise ValueError('Retained experiment is not a bounded regular file.')
                    content = path.read_bytes()
                    if hashlib.sha256(content).hexdigest() != item['file_id']:
                        raise ValueError('Retained experiment checksum changed; import the original file instead.')
                    record = self.experiments.import_file(content, Path(item['filename']).name,
                                                         python_run=run, task_path=item['filename'])
                    run.setdefault('experiments', []).append({
                        'id': record['id'], 'filename': item['filename'], 'sha256': item['file_id'],
                        'has_result': record['program']['experiment']['has_result']})
                except (ValueError, OSError) as error:
                    errors.append({**item, 'message': str(error)[:1000]})
            run['collection_errors'] = errors
            run['collection_status'] = ('partial' if errors and (run.get('experiments') or run.get('artifact'))
                                        else 'failed' if errors else 'completed')
            run['collection_retried_at'] = time.time()
            self.store.put(run)
            return run
        finally:
            if run.get('collection_status') == 'collecting':
                run['collection_status'] = previous_status
                self.store.put(run)
            with self.lock: self.recollecting.discard(run_id)

    def command(self):
        worker = (Path(__file__).parent/'python_worker.py').read_text()
        if self.settings.compute_transport == 'local':
            return [self.settings.local_python or sys.executable, '-u', '-c', worker]
        if not self.settings.ssh_target: raise RuntimeError('Configure the SSH CPU target before running Python.')
        encoded = base64.b64encode(worker.encode()).decode()
        driver = "import base64;exec(compile(base64.b64decode('%s'),'<python-supervisor>','exec'))" % encoded
        import shlex
        return ['ssh','-T','-p',str(self.settings.ssh_port),'-o','BatchMode=yes','-o','ConnectTimeout=12',
            '-o','StrictHostKeyChecking=yes','-o','ForwardAgent=no','-o','ForwardX11=no',self.settings.ssh_target,
            shlex.quote(self.settings.remote_python or 'python3') + ' -u -c '+shlex.quote(driver)]

    def execute(self, run, cancel):
        process = None
        staging = tempfile.TemporaryDirectory(prefix='fqx-transfer-')
        transfer = ExperimentTransfer(Path(staging.name))
        execution_status = None
        try:
            if cancel.is_set(): run['status']='cancelled'; return
            run['status'] = 'running'; self.store.put(run)
            process = subprocess.Popen(self.command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, start_new_session=True)
            request = {'source':run['source'], 'helper':(Path(__file__).parent/'python_publish.py').read_text()}
            if run.get('project'):
                saved = self.settings.database_path.parent / 'python-inputs' / (run['id'] + '.json')
                bundle = json.loads(saved.read_text())
                if (bundle['entry'] != run['project']['entry'] or bundle['files'].get(bundle['entry']) != run['source']
                        or manifest_hash(bundle['files']) != run['project']['snapshot_hash']):
                    raise ValueError('Recorded project input snapshot checksum changed.')
                request.update(bundle)
            process.stdin.write(json.dumps(request)+'\n'); process.stdin.flush()
            def watch():
                started = time.monotonic()
                while process.poll() is None:
                    if cancel.wait(.1) or time.monotonic()-started > 110:
                        try: process.stdin.close()
                        except (BrokenPipeError, OSError, ValueError): pass
                        try: process.wait(timeout=4)
                        except subprocess.TimeoutExpired:
                            try: os.killpg(process.pid, signal.SIGKILL)
                            except ProcessLookupError: pass
                        return
            threading.Thread(target=watch, daemon=True).start()
            stderr = []
            def errors():
                while True:
                    chunk = process.stderr.read(4096)
                    if not chunk: break
                    if sum(map(len,stderr)) < 8192: stderr.append(chunk)
            error_reader = threading.Thread(target=errors, daemon=True); error_reader.start()
            size = 0; exited = False; artifact = None
            for line in process.stdout:
                event = json.loads(line)
                if event['type'] == 'output':
                    if size < 65536:
                        encoded = event['text'].encode('utf-8')
                        budget = 65536-size
                        text = encoded[:budget].decode('utf-8', errors='ignore'); size += len(text.encode('utf-8'))
                        if len(encoded) > budget: run['truncated'] = True
                        run['logs'].append({'stream':event['stream'], 'text':text})
                    elif not run.get('truncated'):
                        run['truncated'] = True
                elif event['type'] == 'runtime': run['runtime'] = event
                elif event['type'] == 'artifact': artifact = event['value']
                elif event['type'] == 'artifact-error':
                    collection_error(run, event.get('name', ''), event['message'])
                    transfer.discard(event.get('name'))
                elif event['type'] in ('fqx-start', 'fqx-chunk', 'fqx-end'):
                    try: transfer.accept(event)
                    except ValueError as error:
                        collection_error(run, event.get('name', ''), error)
                        transfer.discard()
                elif event['type'] == 'error': raise RuntimeError(event['text'])
                elif event['type'] == 'exit':
                    exited = True
                    execution_status = event.get('reason') or ('completed' if event['code'] == 0 else 'failed')
                    run.update(exit_code=event['code'], elapsed_seconds=event['elapsed'],
                               execution_status=execution_status, collection_status='collecting')
                if event['type'] != 'fqx-chunk': self.store.put(run)
            process.wait(timeout=5); error_reader.join(timeout=1)
            if not exited: raise RuntimeError(''.join(stderr)[-2000:] or 'Python worker disconnected before returning an exit status.')
            if transfer.current:
                collection_error(run, transfer.current['name'], 'Experiment transfer ended before completion.')
            if execution_status in ('completed', 'failed') and not cancel.is_set():
                for item in transfer.completed:
                    if cancel.is_set(): break
                    try:
                        record = self.experiments.import_file(item['path'].read_bytes(), Path(item['name']).name,
                                                              python_run=run, task_path=item['name'])
                        run['experiments'].append({'id': record['id'], 'filename': item['name'], 'sha256': item['sha256'], 'has_result': record['program']['experiment']['has_result']})
                    except (ValueError, OSError) as error:
                        # Keep the user's completed file even when its preview fails.
                        try:
                            folder = self.settings.database_path.parent / 'python-artifacts' / run['id']
                            folder.mkdir(parents=True, exist_ok=True)
                            item['path'].replace(folder / (item['sha256'] + '.fqx'))
                        except OSError as storage_error:
                            collection_error(run, item['name'], str(error) + '; cannot retain file: ' + str(storage_error))
                        else:
                            collection_error(run, item['name'], error)
                            if run['collection_errors'] and run['collection_errors'][-1].get('filename') == item['name']:
                                run['collection_errors'][-1]['file_id'] = item['sha256']
                    self.store.put(run)
                if execution_status == 'completed' and artifact:
                    try: run['artifact'] = self.publish(run, artifact)
                    except (ValueError, OSError) as error:
                        collection_error(run, 'artifact.json', error)
            run['status'] = 'cancelled' if cancel.is_set() else execution_status
            run['collection_status'] = ('cancelled' if run['status'] in ('cancelled', 'timed_out') else
                                        'partial' if run['collection_errors'] and (run['experiments'] or run.get('artifact')) else
                                        'failed' if run['collection_errors'] else 'completed')
        except Exception as error:
            run.update(status='cancelled' if cancel.is_set() else 'failed', collection_status='failed', error=str(error)[:2000])
        finally:
            if process:
                if process.poll() is None:
                    try: os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                    process.wait()
                for pipe in (process.stdin, process.stdout, process.stderr):
                    try: pipe.close()
                    except (BrokenPipeError, OSError, ValueError): pass
            staging.cleanup()
            run['finished_at'] = time.time(); self.store.put(run)
            with self.lock: self.active.pop(run['id'], None)

    def publish(self, run, artifact):
        from quantum_workspace_protocol import CircuitRequest, source_hash
        source = artifact.get('source')
        CircuitRequest.parse({'source':source})
        compiled = artifact['compiled']
        if not isinstance(compiled, dict) or not 1 <= compiled.get('qubits',0) <= 16 or len(compiled.get('instructions',[])) > 2000:
            raise ValueError('Invalid published circuit.')
        qubits = compiled['qubits']
        if type(qubits) is not int or not isinstance(compiled.get('version'),str) or type(compiled.get('depth')) is not int or compiled['depth'] < 0:
            raise ValueError('Invalid circuit metadata.')
        for gate in compiled.get('instructions',[]):
            if not isinstance(gate,dict) or not isinstance(gate.get('name'),str) or not isinstance(gate.get('wires'),list) or not gate['wires'] or any(type(wire) is not int or not 0 <= wire < qubits for wire in gate['wires']) or not isinstance(gate.get('params',{}),dict):
                raise ValueError('Invalid published gate.')
        compiled.update(source_hash=source_hash(source), transport=self.settings.compute_transport)
        program = {'id':'python-'+run['id'], 'name':str(artifact.get('name') or run['name'])[:100],
            'source':source, 'compiled':compiled, 'created':int(time.time()*1000),
            'origin':{'language':'python','source':run.get('source',''), 'run_id':run['id']}}
        result = {'program':program}
        if 'counts' in artifact:
            counts = artifact['counts']
            if not isinstance(counts,dict) or any(not isinstance(k,str) or not re.fullmatch('[01]{%s}' % qubits,k) or type(v) is not int or v < 0 for k,v in counts.items()):
                raise ValueError('Invalid published counts.')
            shots = sum(counts.values())
            if not 1 <= shots <= 100000: raise ValueError('Published shots must be 1–100000.')
            job = {'id':program['id'], 'name':program['name'], 'status':'completed', 'created_at':time.time(),
                'request':{'source':source, 'shots':shots, 'seed':None},
                'origin':program['origin'],
                'result':{**compiled,'counts':counts,'shots':shots,'seed':None,'elapsed_seconds':run.get('elapsed_seconds',0)}}
            result['job'] = {'id':job['id'], 'name':job['name'], 'status':job['status']}
        vector = artifact.get('statevector')
        if vector is not None:
            if not isinstance(vector,list) or len(vector)>1024 or len(vector) != 2**qubits or any(not isinstance(pair,list) or len(pair)!=2 or any(type(value) not in (int,float) or not math.isfinite(value) for value in pair) for pair in vector): raise ValueError('Invalid published statevector (maximum 1024 amplitudes).')
            result['statevector'] = vector
        if 'counts' in artifact: self.quantum.store.put(job)
        return result

    def close(self):
        with self.lock:
            for cancel in self.active.values(): cancel.set()
        self.pool.shutdown(wait=True)
