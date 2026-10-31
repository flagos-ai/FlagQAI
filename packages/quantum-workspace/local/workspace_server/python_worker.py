"""Fixed supervisor for explicitly requested Python scripts, locally or over SSH.
This is process isolation and cancellation, not a security sandbox.
"""
import json
import base64
import hashlib
import stat
import codecs
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time


FQX_LIMITS = {'files': 8, 'file_bytes': 16 * 1024 * 1024,
              'total_bytes': 32 * 1024 * 1024, 'chunk_bytes': 64 * 1024}


def collect_experiments(root, emit):
    """Transfer only regular, bounded files from this fresh task directory."""
    pending = [(root, 0)]
    entries = 0
    count = 0
    total = 0
    while pending:
        directory, depth = pending.pop()
        with os.scandir(directory) as items:
            for entry in items:
                entries += 1
                if entries > 4096:
                    emit({'type': 'artifact-error', 'name': '', 'message': 'File scan stopped at 4096 entries.'})
                    return
                name = Path(entry.path).relative_to(root).as_posix()
                if entry.is_dir(follow_symlinks=False):
                    if depth < 8: pending.append((Path(entry.path), depth + 1))
                    else: emit({'type': 'artifact-error', 'name': name, 'message': 'Artifact directory depth exceeds 8.'})
                    continue
                if not entry.name.lower().endswith('.fqx'): continue
                if count >= FQX_LIMITS['files']:
                    emit({'type': 'artifact-error', 'name': name, 'message': 'At most 8 experiments are collected per run.'})
                    continue
                count += 1
                try:
                    descriptor = os.open(entry.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                    with os.fdopen(descriptor, 'rb') as stream:
                        info = os.fstat(stream.fileno())
                        size = info.st_size
                        if not stat.S_ISREG(info.st_mode): raise ValueError('Only regular .fqx files are collected.')
                        if not 0 < size <= FQX_LIMITS['file_bytes']: raise ValueError('Experiment must be between 1 byte and 16 MiB.')
                        if total + size > FQX_LIMITS['total_bytes']: raise ValueError('Combined experiment files exceed 32 MiB.')
                        total += size
                        emit({'type': 'fqx-start', 'index': count, 'name': name, 'size': size})
                        digest = hashlib.sha256()
                        remaining = size
                        while remaining:
                            chunk = stream.read(min(remaining, FQX_LIMITS['chunk_bytes']))
                            if not chunk: raise ValueError('Experiment changed while being collected.')
                            remaining -= len(chunk)
                            digest.update(chunk)
                            emit({'type': 'fqx-chunk', 'index': count, 'data': base64.b64encode(chunk).decode('ascii')})
                        if stream.read(1): raise ValueError('Experiment changed while being collected.')
                        emit({'type': 'fqx-end', 'index': count, 'sha256': digest.hexdigest()})
                except (OSError, ValueError) as error:
                    emit({'type': 'artifact-error', 'name': name, 'message': str(error)[:500]})


def supervise():
    request = json.loads(sys.stdin.readline())
    lock = threading.Lock()
    def emit(value):
        with lock:
            print(json.dumps(value, allow_nan=False), flush=True)
    cancelled = threading.Event()
    def listen():
        os.read(sys.stdin.fileno(), 1)
        cancelled.set()
    threading.Thread(target=listen, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix='flagqai-python-') as folder:
        root = Path(folder)
        entry = request.get('entry', 'main.py')
        files = request.get('files', {entry: request['source']})
        if not isinstance(files, dict) or not 1 <= len(files) <= 64 or entry not in files:
            raise ValueError('Invalid project input snapshot.')
        total = 0
        for name, source in files.items():
            if (not isinstance(name, str) or not isinstance(source, str) or '\\' in name or ':' in name
                    or any(not part or part.startswith('.') for part in name.split('/'))
                    or Path(name).suffix.lower() not in ('.py', '.qasm') or len(source.encode()) > 32768):
                raise ValueError('Invalid project source file.')
            total += len(source.encode())
            if total > 512 * 1024: raise ValueError('Project input snapshot exceeds 512 KiB.')
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(source, encoding='utf-8')
        if 'files' not in request:
            (root/'flagquantum_web.py').write_text(request['helper'], encoding='utf-8')
        emit({'type':'runtime', 'python':sys.version.split()[0], 'cwd':str(root)})
        # Observe the actual SDK imported by the script without requiring it for
        # ordinary Python tasks or changing the user's source file.
        driver = """import runpy,sys,json
from pathlib import Path
try:
    sys.path.insert(0, str(Path(sys.argv[1]).resolve().parent))
    runpy.run_path(sys.argv[1], run_name='__main__')
finally:
    fq = sys.modules.get('flagquantum')
    try:
        import os
        fd = os.open('.runtime.json', os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump({'sdk_version': getattr(fq, '__version__', None), 'save_load_supported': bool(fq and 'save' in getattr(fq, '__all__', ()) and 'load' in getattr(fq, '__all__', ()))}, stream)
    except OSError: pass
"""
        process = subprocess.Popen([sys.executable, '-u', '-c', driver, entry], cwd=root,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=True, env={**os.environ, 'FQ_WEB_ARTIFACT':str(root/'artifact.json'),
                'OMP_NUM_THREADS':'2', 'MKL_NUM_THREADS':'2', 'OPENBLAS_NUM_THREADS':'2'})
        def drain(pipe, stream):
            decoder = codecs.getincrementaldecoder('utf-8')(errors='replace')
            while True:
                chunk = os.read(pipe.fileno(), 4096)
                if not chunk: break
                emit({'type':'output', 'stream':stream, 'text':decoder.decode(chunk)})
        readers = [threading.Thread(target=drain, args=(pipe, stream), daemon=True)
            for pipe, stream in ((process.stdout,'stdout'), (process.stderr,'stderr'))]
        for reader in readers: reader.start()
        started = time.monotonic()
        reason = None
        while process.poll() is None:
            if cancelled.is_set() or time.monotonic()-started > 90:
                reason = 'cancelled' if cancelled.is_set() else 'timed_out'
                break
            time.sleep(.05)
        # Stop descendants too, including processes that outlive main.py.
        try: os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        try: process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            process.wait()
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        for reader in readers: reader.join(timeout=2)
        for pipe in (process.stdout, process.stderr): pipe.close()
        elapsed = round(time.monotonic() - started, 3)
        runtime = root / '.runtime.json'
        if not runtime.is_symlink() and runtime.is_file() and runtime.stat().st_size < 4096:
            try:
                facts = json.loads(runtime.read_text())
                if isinstance(facts, dict):
                    version = facts.get('sdk_version')
                    emit({'type': 'runtime', 'python': sys.version.split()[0], 'cwd': str(root),
                          'sdk_version': version[:64] if isinstance(version, str) else None,
                          'save_load_supported': facts.get('save_load_supported') is True})
            except (ValueError, OSError): pass
        if not reason:
            try: collect_experiments(root, emit)
            except OSError as error: emit({'type': 'artifact-error', 'name': '', 'message': str(error)[:500]})
        artifact = root/'artifact.json'
        if not reason and process.returncode == 0 and artifact.is_file():
            try:
                if artifact.is_symlink() or artifact.stat().st_size > 1024*1024: raise ValueError('Published artifact exceeds 1 MiB or is a symbolic link.')
                emit({'type':'artifact', 'value':json.loads(artifact.read_text())})
            except (OSError, ValueError) as error:
                emit({'type': 'artifact-error', 'name': 'artifact.json', 'message': str(error)[:500]})
        emit({'type':'exit', 'code':process.returncode, 'reason':reason, 'elapsed':elapsed})


if __name__ == '__main__':
    try: supervise()
    except Exception as error:
        print(json.dumps({'type':'error', 'text':str(error)[:2000]}), flush=True)
        sys.exit(1)
