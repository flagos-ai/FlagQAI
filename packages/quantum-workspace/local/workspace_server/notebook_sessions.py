"""Persistent notebook documents and explicit, idempotent IPython execution."""
from hashlib import sha256
import json
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import sys
import threading
import time
import uuid

from .job_store import SQLiteJobStore
from .notebooks import notebook_bundle
from .projects import ProjectConflict


def identity(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{32}', value):
        raise ValueError('A 32-character request identity is required.')
    return value


def digest(value):
    return sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


class NotebookSessions:
    def __init__(self, settings, python_runs):
        self.settings, self.python_runs = settings, python_runs
        self.documents = SQLiteJobStore(settings.database_path.with_suffix('.notebooks.sqlite3'))
        self.runs = SQLiteJobStore(settings.database_path.with_suffix('.notebook-runs.sqlite3'))
        self.documents.initialize()
        self.runs.initialize()
        self.lock = threading.RLock()
        self.kernels = {}
        self.closed = False
        for run in self.runs.list(limit=None):
            if run['status'] == 'failed' and not run.get('finished_at'):
                run.update(status='interrupted', finished_at=time.time(), error='Service restarted. Kernel variables were lost; no cells were replayed.')
                for cell in run['cells']:
                    if cell['status'] in ('queued', 'running'):
                        cell['status'] = 'interrupted'
                self.runs.put(run)

    def create(self, data):
        key = identity(data.get('request_id'))
        with self.lock:
            old = self.documents.get(key)
            if old:
                if old['notebook_id'] != data.get('notebook_id'):
                    raise ProjectConflict('Notebook identity already belongs to another document.')
                return self.read(key)
            _, item, bundle, raw = notebook_bundle(self.settings.web_root, data.get('notebook_id'))
            document = json.loads(raw)
            cells = [{'id': uuid.uuid4().hex, 'cell_type': cell['cell_type'],
                      'source': ''.join(cell['source'])} for cell in document['cells']]
            if bundle.get('inputHashes'):
                cells.insert(0, {'id': uuid.uuid4().hex, 'cell_type': 'code',
                    'source': '# Prepare the pinned data files in this notebook workspace.\nfrom notebook_inputs import prepare\nprepare()'})
            record = {'id': key, 'status': 'saved', 'notebook_id': item['id'], 'title': item['title'],
                      'revision': uuid.uuid4().hex, 'cells': cells}
            self.documents.put(record)
            return self.read(key)

    def read(self, key):
        record = self.documents.get(identity(key))
        if not record:
            raise FileNotFoundError('Notebook workspace not found.')
        with self.lock:
            kernel = self.kernels.get(key)
            return {**record, 'kernel': ('busy' if kernel.get('busy') else 'idle') if kernel and kernel['process'].poll() is None else 'stopped',
                    'kernel_id': kernel['id'] if kernel else None,
                    'runs': [run for run in self.runs.list(limit=None) if run['notebook_id'] == key][:100]}

    def save(self, key, data):
        cells = data.get('cells')
        if not isinstance(cells, list) or not 1 <= len(cells) <= 1000:
            raise ValueError('Notebook must contain 1 to 1000 cells.')
        seen = set()
        for cell in cells:
            cell_id = identity(cell.get('id'))
            if cell_id in seen or cell.get('cell_type') not in ('code', 'markdown', 'raw'):
                raise ValueError('Invalid or duplicate cell.')
            seen.add(cell_id)
            if not isinstance(cell.get('source'), str) or len(cell['source'].encode()) > 32768:
                raise ValueError('Cell source must be at most 32 KiB.')
        if len(json.dumps(cells).encode()) > 512 * 1024:
            raise ValueError('Notebook source exceeds 512 KiB.')
        with self.lock:
            record = self.read(key)
            if data.get('revision') != record['revision']:
                raise ProjectConflict('Notebook changed in another window. Local edits are retained; reopen the saved version before retrying.')
            saved = {name: record[name] for name in ('id', 'status', 'notebook_id', 'title')}
            saved.update(revision=uuid.uuid4().hex, cells=[{k: c[k] for k in ('id', 'cell_type', 'source')} for c in cells])
            self.documents.put(saved)
            return self.read(key)

    def _stop(self, key):
        kernel = self.kernels.pop(key, None)
        if not kernel:
            return
        try:
            kernel['process'].stdin.write(json.dumps({'action': 'shutdown'}) + '\n')
            kernel['process'].stdin.flush()
            kernel['process'].wait(timeout=5)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            if os.name == 'posix':
                try: os.killpg(kernel['process'].pid, signal.SIGKILL)
                except ProcessLookupError: pass
            else:
                kernel['process'].kill()
            kernel['process'].wait(timeout=5)
        for stream in (kernel['process'].stdin, kernel['process'].stdout):
            stream.close()
        kernel['log'].close()

    def control(self, key, action):
        with self.lock:
            self.read(key)
            kernel = self.kernels.get(key)
            if action == 'interrupt' and kernel:
                kernel['process'].stdin.write(json.dumps({'action': 'interrupt'}) + '\n')
                kernel['process'].stdin.flush()
            elif action == 'restart':
                if kernel and kernel.get('busy'):
                    raise ValueError('Interrupt the active cell and wait before restarting the kernel.')
                self._stop(key)
            else:
                if action != 'interrupt':
                    raise ValueError('Unknown kernel action.')
            return self.read(key)

    def execute(self, key, data):
        request_id = identity(data.get('request_id'))
        cell_ids = data.get('cell_ids')
        if not isinstance(cell_ids, list) or not cell_ids or len(cell_ids) > 1000 or any(not isinstance(value, str) for value in cell_ids) or len(set(cell_ids)) != len(cell_ids):
            raise ValueError('Select distinct code cells.')
        with self.lock:
            record = self.read(key)
            selected = self.python_runs.selected_settings()
            if selected.compute_transport != 'local' or selected.macos_python_isolation:
                raise ValueError('Interactive notebooks currently require a local Python environment without process isolation. Existing SSH script execution remains available.')
            fingerprint = repr(selected)
            cells = [{k: cell[k] for k in ('id', 'source')} for cell in record['cells']
                     if cell['cell_type'] == 'code' and cell['id'] in cell_ids]
            if len(cells) != len(cell_ids):
                raise ValueError('A selected code cell no longer exists.')
            signature = digest({'key': key, 'revision': data.get('revision'), 'cells': data.get('cell_ids')})
            old = self.runs.get(request_id)
            if old:
                if old['signature'] != signature:
                    raise ProjectConflict('Execution identity was reused for different cells.')
                return self.read(key)
            if record['revision'] != data.get('revision'):
                raise ProjectConflict('Save the current notebook revision before running.')
            if not cells:
                raise ValueError('Select at least one code cell.')
            kernel = self.kernels.get(key)
            if kernel and kernel.get('busy'):
                raise ValueError('A cell is already running in this notebook.')
            if kernel and kernel['fingerprint'] != fingerprint:
                raise ValueError('Compute environment changed. Restart the notebook kernel before running.')
            if self.closed:
                raise ValueError('Notebook service is shutting down.')
            if not kernel:
                if len(self.kernels) >= 4:
                    raise ValueError('Four notebook kernels are open. Restart another notebook kernel to release it.')
                root = self.settings.database_path.parent / 'notebook-workspaces' / key
                root.mkdir(parents=True, exist_ok=True)
                _, _, bundle, _ = notebook_bundle(self.settings.web_root, record['notebook_id'])
                # Per-notebook working directory retains user-created results.
                # Source support files are seeded once, never overwritten.
                for name, source in bundle['files'].items():
                    target = root / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if not target.exists():
                        target.write_text(source)
                log = tempfile_log(root)
                process = subprocess.Popen([selected.local_python or sys.executable, '-u', '-c',
                    Path(__file__).with_name('notebook_kernel_worker.py').read_text()], cwd=root,
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True,
                    start_new_session=os.name == 'posix',
                    env={**os.environ, 'MPLBACKEND': 'module://matplotlib_inline.backend_inline',
                         'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2'})
                kernel = {'process': process, 'log': log, 'events': queue.Queue(), 'busy': False,
                          'fingerprint': fingerprint, 'id': uuid.uuid4().hex}
                self.kernels[key] = kernel
                threading.Thread(target=self._read_events, args=(kernel,), daemon=True).start()
            kernel['busy'] = True
            run = {'id': request_id, 'notebook_id': key, 'signature': signature, 'status': 'queued',
                   'kernel_id': kernel['id'], 'created_at': time.time(), 'revision': record['revision'],
                   'cells': [{**cell, 'status': 'queued', 'outputs': []} for cell in cells]}
            self.runs.put(run)
            kernel['thread'] = threading.Thread(target=self._execute, args=(key, kernel, run), daemon=True)
            kernel['thread'].start()
            return self.read(key)

    @staticmethod
    def _read_events(kernel):
        try:
            for line in kernel['process'].stdout:
                if len(line) > 2 * 1024 * 1024:
                    raise ValueError('Kernel response exceeded the output limit.')
                kernel['events'].put(json.loads(line))
        except (ValueError, OSError):
            pass
        finally:
            kernel['events'].put({'type': 'fatal', 'error': 'Kernel connection closed. No cells were replayed.'})

    def _execute(self, key, kernel, run):
        try:
            if not kernel.get('ready'):
                ready = kernel['events'].get(timeout=35)
                if ready['type'] != 'ready':
                    raise ValueError(ready.get('error', 'Kernel startup failed.'))
                kernel['ready'] = ready
            run.update(status='running', runtime=kernel['ready'])
            kernel['process'].stdin.write(json.dumps({'action': 'execute', 'cells': run['cells']}) + '\n')
            kernel['process'].stdin.flush()
            while True:
                event = kernel['events'].get(timeout=100)
                if event['type'] == 'fatal':
                    raise ValueError(event['error'])
                if event['type'] == 'done':
                    break
                cell = next(c for c in run['cells'] if c['id'] == event.get('cell_id'))
                if event['type'] == 'cell_start':
                    cell['status'] = 'running'
                elif event['type'] == 'output':
                    if event['output']['output_type'] == 'clear_output':
                        cell['outputs'] = []
                    else:
                        cell['outputs'].append(event['output'])
                elif event['type'] == 'cell_done':
                    cell.update(status=event['status'], execution_count=event['execution_count'])
                self.runs.put(run)
            run['status'] = 'failed' if any(c['status'] == 'failed' for c in run['cells']) else 'completed'
            for cell in run['cells']:
                if cell['status'] == 'queued':
                    cell['status'] = 'skipped'
        except (ValueError, OSError, queue.Empty) as error:
            run.update(status='interrupted', error=str(error) or 'Kernel response timed out. Restart the kernel before continuing.')
            for cell in run['cells']:
                if cell['status'] in ('queued', 'running'):
                    cell['status'] = 'interrupted'
            with self.lock:
                self._stop(key)
        finally:
            run['finished_at'] = time.time()
            self.runs.put(run)
            kernel['busy'] = False

    def close(self):
        with self.lock:
            self.closed = True
            threads = [kernel.get('thread') for kernel in self.kernels.values()]
            for key in list(self.kernels):
                self._stop(key)
        for thread in threads:
            if thread:
                thread.join(timeout=10)


def tempfile_log(root):
    # Not returned to the browser: kernels can print diagnostics outside IOPub.
    return open(root / 'kernel.log', 'w')
