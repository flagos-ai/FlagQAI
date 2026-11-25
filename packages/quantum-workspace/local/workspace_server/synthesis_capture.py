"""Task-local observation of SDK returns; does not replace or execute SDK APIs."""


def install_synthesis_capture():
    import builtins
    import dis
    import hashlib
    import json
    import os
    from pathlib import Path
    import sys
    import tempfile
    import threading

    root = Path.cwd()
    folder = None
    original_import = builtins.__import__
    previous_profile = sys.getprofile()
    thread_profile = getattr(threading, 'getprofile', lambda: None)
    previous_thread_profile = thread_profile()
    records, errors = [], []
    lock = threading.RLock()
    installing = False
    installed = False
    tool_id = None
    guard = threading.local()
    codes = {}
    sdk = {}

    def note(message):
        if len(errors) < 8:
            errors.append(str(message)[:500])

    def stage(phase):
        try:
            fd = os.open(root / '.synthesis-stage.json', os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump({'phase': phase}, stream)
        except OSError:
            pass  # Progress reporting must not change research execution.

    def write(record, result=None):
        nonlocal folder
        try:
            if folder is None:
                folder = Path(tempfile.mkdtemp(prefix='flagqai-captured-', dir=root))
            path = folder / ('circuit-%03d.fqx' % record['index'])
            sdk['save'](path, record['plan'], result=result, overwrite=True)
            others = sum(row['path'].stat().st_size for row in records
                         if row is not record and row.get('path') and row['path'].exists())
            if path.stat().st_size > 16 * 1024**2 or others + path.stat().st_size > 32 * 1024**2:
                path.unlink()
                raise ValueError('Automatic circuit archives exceed the 16 MiB file or 32 MiB run limit.')
            record.update(path=path, has_result=result is not None)
        except Exception as error:
            note('Automatic circuit capture: ' + str(error))

    def observed_return(frame, event, value):
        if frame.f_code not in codes:
            return
        try:
            kind = codes[frame.f_code]
            with lock:
                if event == 'call':
                    if kind == 'synthesize':
                        stage('synthesizing')
                    elif kind == 'run':
                        product = frame.f_locals.get('program_or_plan')
                        if any(product is row['program'] or id(product) in row['identities'] for row in records):
                            stage('computing')
                    return
                if kind == 'synthesize' and isinstance(value, sdk['Program']):
                    if len(records) >= 8:
                        note('Automatic circuit capture is limited to eight synthesis products per run.')
                        stage('python')
                        return
                    plan = value.execution
                    record = {'index': len(records) + 1, 'program': value, 'plan': plan,
                              'identities': {id(plan), id(value.circuit)}, 'explicit': []}
                    records.append(record)
                    stage('capturing')
                    write(record)
                    stage('python')
                elif kind == 'run' and value is not None:
                    product = frame.f_locals.get('program_or_plan')
                    for record in records:
                        if product is record['program'] or id(product) in record['identities']:
                            record['plan'] = value.plan
                            record['identities'].add(id(value.plan))
                            stage('capturing')
                            write(record, value)
                            stage('python')
                            break
                elif kind == 'save':
                    if not records:
                        return
                    # A profile return event can also mean exception unwinding.
                    # Only a normal function return qualifies as an explicit save.
                    if dis.opname[frame.f_code.co_code[frame.f_lasti]] not in ('RETURN_VALUE', 'RETURN_CONST'):
                        return
                    path = Path(frame.f_locals['path'])
                    if path.is_symlink():
                        return
                    path = path.resolve()
                    try:
                        path.relative_to(root)
                    except ValueError:
                        return  # External files cannot replace the task archive.
                    product = frame.f_locals['program']
                    if path.is_file() and not path.is_symlink() and path.stat().st_size <= 16 * 1024**2:
                        for record in records:
                            if id(product) in record['identities']:
                                record['explicit'] = (record['explicit'] + [
                                    (path, hashlib.sha256(path.read_bytes()).hexdigest(),
                                     frame.f_locals.get('result') is not None)])[-8:]
        except Exception as error:
            note('Automatic circuit observation: ' + str(error))

    def observe(frame, event, value):
        if getattr(guard, 'active', False):
            return
        if event not in ('call', 'return') or frame.f_code not in codes:
            return
        guard.active = True
        try:
            observed_return(frame, event, value)
        finally:
            guard.active = False

    def monitored_return(code, offset, value):
        observe(sys._getframe(1), 'return', value)

    def monitored_start(code, offset):
        observe(sys._getframe(1), 'call', None)

    def install(fq):
        nonlocal installed, tool_id
        try:
            synth = original_import('flagquantum.synth', fromlist=['Program', 'synthesize'])
        except ImportError:
            return
        if getattr(getattr(synth, '__spec__', None), '_initializing', False):
            return
        functions = {'synthesize': getattr(synth, 'synthesize', None),
                     'run': getattr(fq, 'run', None), 'save': getattr(fq, 'save', None)}
        if not isinstance(getattr(synth, 'Program', None), type) or any(not hasattr(fn, '__code__') for fn in functions.values()):
            return
        installed = True
        sdk.update(Program=synth.Program, save=fq.save)
        codes.update({fn.__code__: kind for kind, fn in functions.items()})
        monitoring = getattr(sys, 'monitoring', None)
        if monitoring is not None:
            for candidate in range(5, -1, -1):
                try:
                    monitoring.use_tool_id(candidate, 'FlagQAI synthesis capture')
                except ValueError:
                    continue
                tool_id = candidate
                monitoring.register_callback(tool_id, monitoring.events.PY_RETURN, monitored_return)
                monitoring.register_callback(tool_id, monitoring.events.PY_START, monitored_start)
                for code in codes:
                    monitoring.set_local_events(tool_id, code, monitoring.events.PY_RETURN | monitoring.events.PY_START)
                return
        if previous_profile is not None or previous_thread_profile is not None:
            note('Automatic circuit observation is unavailable while another Python profiler is active.')
            return
        # Compatibility path for interpreters without local monitoring events.
        sys.setprofile(observe)
        threading.setprofile(observe)

    def importing(name, globals=None, locals=None, fromlist=(), level=0):
        nonlocal installing
        value = original_import(name, globals, locals, fromlist, level)
        if not installed and not installing and (name == 'flagquantum' or name.startswith('flagquantum.')):
            fq = sys.modules.get('flagquantum')
            if fq and not getattr(getattr(fq, '__spec__', None), '_initializing', False):
                installing = True
                try:
                    install(fq)
                except Exception as error:
                    note('Automatic circuit capture setup: ' + str(error))
                finally:
                    installing = False
                    if installed:
                        builtins.__import__ = original_import
        return value

    builtins.__import__ = importing

    def finish():
        builtins.__import__ = original_import
        if sys.getprofile() is observe:
            sys.setprofile(previous_profile)
        if installed and thread_profile() in (None, observe):
            threading.setprofile(previous_thread_profile)
        if tool_id is not None:
            monitoring = sys.monitoring
            for code in codes:
                monitoring.set_local_events(tool_id, code, 0)
            monitoring.register_callback(tool_id, monitoring.events.PY_RETURN, None)
            monitoring.register_callback(tool_id, monitoring.events.PY_START, None)
            monitoring.free_tool_id(tool_id)
        paths = []
        with lock:
            for record in records:
                path = record.get('path')
                if not path or not path.exists():
                    continue
                try:
                    explicit = any(
                        p.is_file() and not p.is_symlink() and p.stat().st_size <= 16 * 1024**2
                        and (not record.get('has_result') or has_result)
                        and hashlib.sha256(p.read_bytes()).hexdigest() == digest
                        for p, digest, has_result in record['explicit'])
                except OSError:
                    explicit = False
                if explicit:
                    path.unlink(missing_ok=True)
                else:
                    paths.append(path.relative_to(root).as_posix())
        try:
            fd = os.open(root / '.synthesis-capture.json', os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump({'files': paths, 'errors': errors}, stream)
        except Exception:
            pass

    return finish
