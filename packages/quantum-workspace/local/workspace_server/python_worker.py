"""Fixed supervisor for explicitly requested Python scripts, locally or over SSH.
The local macOS runner can additionally confine the user script with Seatbelt.
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


# Execute capability checks inside the same confined interpreter as the script.
SYNTHESIS_PREFLIGHT_CODE = '''"""Check explicit synth imports in the interpreter that will execute the task."""


def check_synthesis_environment(entry):
    import ast
    import importlib
    from pathlib import Path

    tree = ast.parse(Path(entry).read_text(encoding='utf-8'), filename=entry)
    required = set()
    aliases = set()
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == 'flagquantum.synth':
            required.update(alias.name for alias in node.names if alias.name != '*')
        if isinstance(node, ast.ImportFrom) and node.module == 'flagquantum':
            aliases.update(alias.asname or alias.name for alias in node.names if alias.name == 'synth')
        if isinstance(node, ast.Import):
            aliases.update(alias.asname for alias in node.names
                           if alias.name == 'flagquantum.synth' and alias.asname)
    # Inspect direct top-level calls only. Capability checks guarded by
    # try/if, optional methods in callbacks and shadowed aliases belong to Python.
    rebound = {node.id for node in ast.walk(tree)
               if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store)}
    for statement in tree.body:
        if not isinstance(statement, (ast.Expr, ast.Assign, ast.AnnAssign)):
            continue
        value = statement.value
        if (isinstance(value, ast.Call) and isinstance(value.func, ast.Attribute)
                and isinstance(value.func.value, ast.Name)
                and value.func.value.id in aliases - rebound):
            required.add(value.func.attr)
    if not required:
        return
    guidance = ('Select a compatible SDK in the compute environment and check it again. '
                'Version numbers alone do not establish support. No research code was executed.')
    try:
        synth = importlib.import_module('flagquantum.synth')
    except ImportError as error:
        raise RuntimeError('Environment check: FlagQuantum synth could not be imported. ' + guidance) from error
    missing = sorted(name for name in required if not hasattr(synth, name))
    if missing:
        raise RuntimeError('Environment check: missing FlagQuantum synth APIs: '
                           + ', '.join(missing) + '. ' + guidance)
'''

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


def confined_command(command, root):
    runner = '/usr/bin/sandbox-exec'
    if sys.platform != 'darwin' or not os.access(runner, os.X_OK):
        raise RuntimeError('macOS Python isolation requires an available Seatbelt runner.')
    root = root.resolve()
    runtime_roots = {Path(sys.prefix).resolve(), Path(sys.base_prefix).resolve()}
    if any(path in (Path('/'), Path.home().resolve()) for path in runtime_roots):
        raise RuntimeError('Configure a dedicated Python installation for macOS isolation.')
    readable = runtime_roots | {
        root, Path('/System'), Path('/usr/lib'), Path('/usr/bin'),
        Path('/bin'), Path('/dev/null'), Path('/dev/urandom'),
    }
    reads = ' '.join('(subpath ' + json.dumps(str(path), ensure_ascii=False) + ')' for path in sorted(readable))
    parents = {parent for path in readable for parent in path.parents}
    metadata = ' '.join('(literal ' + json.dumps(str(path), ensure_ascii=False) + ')' for path in sorted(parents))
    profile = ('(version 1)(deny default)(import "system.sb")(deny network*)'
               '(allow process-exec process-fork sysctl-read)'
               '(allow file-read* ' + reads + ')'
               '(allow file-read-metadata ' + metadata + ')'
               '(allow file-write* (subpath ' + json.dumps(str(root), ensure_ascii=False) + '))')
    env = {'PATH': '/usr/bin:/bin', 'HOME': str(root), 'TMPDIR': str(root)}
    # Seatbelt requires the canonical executable. CPython uses this macOS
    # launcher value to locate the original virtual environment.
    env['__PYVENV_LAUNCHER__'] = command[0]
    executable = str(Path(command[0]).resolve())
    return [runner, '-p', profile, executable, *command[1:]], env


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
                    or Path(name).suffix.lower() not in ('.py', '.qasm') or len(source.encode()) > 65536):
                raise ValueError('Invalid project source file.')
            total += len(source.encode())
            if total > 512 * 1024: raise ValueError('Project input snapshot exceeds 512 KiB.')
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(source, encoding='utf-8')
        if 'synthesis_files' in request:
            assets = request['synthesis_files']
            if not isinstance(assets, dict) or len(assets) > 4096:
                raise ValueError('Invalid synthesis input snapshot.')
            size = 0
            for name, encoded in assets.items():
                if (not (name.startswith('examples/') or (name.startswith('resources/') or '/' not in name) and Path(name).suffix in ('.csv', '.json', '.npy', '.npz', '.pth')) or '\\' in name
                        or any(part in ('', '.', '..') for part in name.split('/'))):
                    raise ValueError('Invalid synthesis input path.')
                raw = base64.b64decode(encoded, validate=True)
                size += len(raw)
                if size > 16 * 1024 * 1024:
                    raise ValueError('Synthesis input exceeds 16 MiB.')
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
            entry = request['synthesis_entry']
            if entry not in assets or not entry.endswith('.py'):
                raise ValueError('Missing synthesis entry.')
        if 'files' not in request:
            (root/'flagquantum_web.py').write_text(request['helper'], encoding='utf-8')
        emit({'type':'runtime', 'python':sys.version.split()[0], 'cwd':str(root)})
        # Observe the actual SDK imported by the script without requiring it for
        # ordinary Python tasks or changing the user's source file.
        driver = RUNTIME_MANIFEST_CODE + "\n" + SYNTHESIS_PREFLIGHT_CODE + "\n" + """import runpy,sys,json
from pathlib import Path
try:
    sys.path.insert(0, str(Path.cwd()))
    sys.path.insert(0, str(Path(sys.argv[1]).resolve().parent))
    entry = sys.argv[1]
    sys.argv = [entry]
    package = str(Path(entry).parent).replace('/', '.')
    if package.startswith('examples.'):
        import importlib
        importlib.import_module(package)
    check_synthesis_environment(entry)
    runpy.run_module(entry[:-3].replace('/', '.'), run_name='__main__', alter_sys=True) if package.startswith('examples.') else runpy.run_path(entry, run_name='__main__')
finally:
    fq = sys.modules.get('flagquantum')
    try:
        import os
        fd = os.open('.runtime.json', os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(runtime_manifest(fq), stream)
    except Exception: pass
"""
        command = [sys.executable, '-u', '-c', driver, entry]
        env = os.environ
        if globals().get('ISOLATE_PYTHON', False):
            command, env = confined_command(command, root)
        process = subprocess.Popen(command, cwd=root,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=True, env={**env, 'FQ_WEB_ARTIFACT':str(root/'artifact.json'),
                'MPLBACKEND':'Agg', 'OMP_NUM_THREADS':'2', 'MKL_NUM_THREADS':'2', 'OPENBLAS_NUM_THREADS':'2'})
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
        if not runtime.is_symlink() and runtime.is_file() and runtime.stat().st_size < 65536:
            try:
                facts = json.loads(runtime.read_text())
                if isinstance(facts, dict):
                    version = facts.get('sdk_version')
                    emit({'type': 'runtime', 'python': sys.version.split()[0], 'cwd': str(root),
                          'sdk_version': version[:64] if isinstance(version, str) else None,
                          'save_load_supported': facts.get('save_load_supported') is True, 'environment_manifest': facts})
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
