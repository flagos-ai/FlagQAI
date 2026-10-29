"""Source-only local launcher. Reuses the native Harness; never submits a prompt."""
import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent / 'local'))
from workspace_server.config import WorkspaceSettings


def port(value):
    result = int(value)
    if not 1 <= result <= 65535:
        raise ValueError('Ports must be between 1 and 65535.')
    return result


def agent_status(number):
    try:
        with urlopen('http://127.0.0.1:%s/v1/health' % number, timeout=2) as response:
            health = json.load(response)
        if not isinstance(health, dict) or health.get('product') != 'FlagQAI' or type(health.get('backendCount')) is not int:
            return 'invalid'
        return 'ready' if health['backendCount'] else 'no-backend'
    except HTTPError:
        return 'invalid'
    except (ValueError, TypeError):
        return 'invalid'
    except (URLError, OSError):
        # Refuse to replace an unrelated or unresponsive listener.
        with socket.socket() as probe:
            return 'invalid' if probe.connect_ex(('127.0.0.1', number)) == 0 else 'offline'


def sdk_status(command, remote_python=None):
    probe = 'import json,flagquantum as fq,torch; print(json.dumps({"version":fq.__version__,"save_load":callable(getattr(fq,"save",None)) and callable(getattr(fq,"load",None))}))'
    try:
        invocation = command + ([shlex.quote(remote_python) + ' -c ' + shlex.quote(probe)]
                                if remote_python else [probe])
        result = subprocess.run(invocation, capture_output=True, text=True, timeout=20)
        data = json.loads(result.stdout.strip().splitlines()[-1])
        return 'FlagQuantum %s; save/load %s' % (data['version'], 'ready' if data['save_load'] else 'unavailable')
    except (OSError, subprocess.TimeoutExpired, ValueError, IndexError, KeyError):
        return None


def preflight(settings, *, no_agent=False, probe=False):
    checks = []
    def add(level, text): checks.append((level, text))
    if sys.version_info < (3, 9): add('ERROR', 'Python 3.9+ is required.')
    else: add('OK', 'Python %s' % sys.version.split()[0])
    built = settings.web_root / 'assets/app.mjs'
    if built.is_file(): add('OK', 'Built Web assets found.')
    else: add('ERROR', 'Web assets missing. Run pnpm web:install && pnpm web:build.')
    if no_agent:
        add('INFO', 'Agent startup disabled; workbench editing and compute remain available.')
    else:
        node = shutil.which('node')
        if not node: add('ERROR', 'Node.js 24+ is required for the native Agent service.')
        else:
            try:
                version = subprocess.check_output([node, '--version'], text=True, timeout=3)
                if int(version.strip().lstrip('v').split('.')[0]) < 24:
                    add('ERROR', 'Node.js 24+ is required for this Web development entry.')
                else: add('OK', 'Node.js ' + version.strip())
            except (OSError, ValueError, subprocess.SubprocessError):
                add('ERROR', 'Cannot determine Node.js version.')
        status = agent_status(settings.harness_port)
        if status == 'ready': add('OK', 'Native Agent service available on loopback port %s.' % settings.harness_port)
        elif status == 'offline':
            if not (ROOT / 'apps/cli/lib/types/index.js').is_file():
                add('ERROR', 'Native CLI build missing. Run pnpm cli:install && pnpm cli:build.')
            else: add('INFO', 'Native Agent service will start on port %s; no model prompt is sent.' % settings.harness_port)
        else: add('ERROR', 'Agent port %s is occupied by an incompatible service or has no backend. Inspect it; it will not be replaced.' % settings.harness_port)
    if settings.compute_transport == 'ssh':
        if not shutil.which('ssh'): add('WARN', 'SSH executable missing; remote compute is unavailable.')
        elif not settings.ssh_target: add('WARN', 'Set FQ_SSH_TARGET (or ignored local settings) before using SSH compute.')
        elif probe:
            command = ['ssh', '-T', '-p', str(settings.ssh_port), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
                       '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no', '-o', 'ForwardX11=no', '--', settings.ssh_target]
            # Pass one quoted remote command; never interpolate configuration as shell code.
            check = sdk_status(command, remote_python=settings.remote_python or 'python3')
            if check: add('OK', 'Remote Python: ' + check)
            else: add('WARN', 'Remote SDK probe failed. Check SSH access and remote_python; no packages were installed.')
        else: add('INFO', 'SSH configured. pnpm web:doctor --probe checks access and the SDK without running a circuit.')
    elif settings.compute_transport == 'local':
        status = sdk_status([settings.local_python or sys.executable, '-c'])
        add('OK' if status else 'WARN', 'Local compute: ' + (status or 'FlagQuantum/PyTorch unavailable; set FQ_LOCAL_PYTHON.'))
    else: add('ERROR', 'FQ_COMPUTE_TRANSPORT must be local or ssh.')
    reader = sdk_status([settings.experiment_python or settings.local_python or sys.executable, '-c'])
    add('OK' if reader and reader.endswith('ready') else 'WARN', 'Local .fqx reader: ' + (reader or 'unavailable; set FQ_EXPERIMENT_PYTHON to a FlagQuantum save/load environment.'))
    return checks


def stop_owned(children):
    for child in reversed(children):
        if child.poll() is None:
            if os.name == 'posix':
                try: os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError: pass
            else: child.terminate()
    for child in reversed(children):
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name == 'posix':
                try: os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError: pass
            else: child.kill()
            child.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check readiness without starting services.')
    parser.add_argument('--probe', action='store_true', help='Also test configured SSH access and SDK import; no circuit or model call.')
    parser.add_argument('--no-agent', action='store_true', help='Start only the Web workbench.')
    args = parser.parse_args()
    try:
        settings = WorkspaceSettings.from_root(ROOT)
        port(settings.port); port(settings.harness_port); port(settings.ssh_port)
        if settings.port == settings.harness_port:
            raise ValueError('FQ_PORT and FQ_HARNESS_PORT must be different.')
    except (OSError, ValueError, TypeError) as error:
        parser.error(str(error))
    checks = preflight(settings, no_agent=args.no_agent, probe=args.probe)
    for level, message in checks: print('[%s] %s' % (level, message), flush=True)
    if any(level == 'ERROR' for level, _ in checks): return 1
    if args.check: return 0
    with socket.socket() as check:
        try: check.bind(('127.0.0.1', settings.port))
        except OSError:
            print('Web port %s is in use. Reuse that host or choose FQ_PORT; no existing process was stopped.' % settings.port)
            return 1
    children = []
    def interrupted(_signal, _frame): raise KeyboardInterrupt
    for name in ('SIGINT', 'SIGTERM'): signal.signal(getattr(signal, name), interrupted)
    try:
        if not args.no_agent and agent_status(settings.harness_port) == 'offline':
            children.append(subprocess.Popen([shutil.which('node'), str(ROOT / 'apps/cli/bin/flagqai.js'), 'serve', '--port', str(settings.harness_port)], cwd=ROOT, start_new_session=(os.name == 'posix')))
            deadline = time.monotonic() + 30
            while agent_status(settings.harness_port) != 'ready':
                if children[0].poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError('Native Agent did not become ready. Check its output; no fallback backend was started.')
                time.sleep(.2)
        children.append(subprocess.Popen([sys.executable, str(Path(__file__).with_name('serve.py'))], cwd=ROOT, start_new_session=(os.name == 'posix')))
        print('Open http://127.0.0.1:%s. Ctrl-C stops only services started by this launcher.' % settings.port, flush=True)
        while all(child.poll() is None for child in children): time.sleep(.2)
        return next((child.returncode for child in children if child.returncode), 0)
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr); return 1
    finally: stop_owned(children)


if __name__ == '__main__':
    raise SystemExit(main())
