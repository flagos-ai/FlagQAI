"""Checked circuit execution profiles, independent of compute connection settings."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time

DEFAULT_PROFILE = {'target':'simulator', 'backend':'pytorch', 'method':'statevector',
                   'device':'cpu', 'scale':'single_device', 'precision':'complex64'}


def validate_profile(data):
    if not isinstance(data, dict) or set(data) != set(DEFAULT_PROFILE):
        raise ValueError('Provide a complete execution profile.')
    if data['target'] != 'simulator':
        raise ValueError('Real QPU submission is not connected. No simulator substitution is allowed.')
    if data['backend'] != 'pytorch' or data['method'] not in ('statevector','mps','tensor_network','density_matrix','stabilizer'):
        raise ValueError('Choose a connected counts simulation method.')
    import re
    if not isinstance(data['device'], str) or not re.fullmatch(r'[a-z][a-z0-9_]*(?::[0-9]{1,3})?', data['device']):
        raise ValueError('Choose a detected compute device.')
    if data['scale'] != 'single_device' or data['precision'] != 'complex64':
        raise ValueError('This Web executor currently supports single-device complex64 execution.')
    return dict(data)


class BoundExecutionAdapter:
    def __init__(self, adapter, profile):
        self.adapter = adapter
        self.profile = dict(profile)
        self.transport = adapter.transport

    def execute(self, request):
        return self.adapter.execute({**request, 'execution':self.profile})


class ExecutionProfiles:
    def __init__(self, environments):
        self.environments = environments
        self.path = environments.path.with_name('execution-profile.json')
        self.lock = threading.RLock()
        self.probe_lock = threading.Lock()
        self.revision = 0
        self.profile = dict(DEFAULT_PROFILE)
        self.environment = None
        self.report = None
        self.checked_at = 0
        if self.path.exists():
            saved = json.loads(self.path.read_text())
            self.profile = validate_profile(saved['profile'])
            self.environment = saved['environment']
            self.revision = saved['revision']
            if type(self.revision) is not int or self.revision < 0:
                raise ValueError('Invalid saved execution profile revision.')

    def describe(self):
        # Always lock environment before profile to match submission and activation.
        with self.environments.lock, self.lock:
            return {'profile':dict(self.profile), 'revision':self.revision,
                'environment_revision':self.environments.revision,
                'stale': self.environment is not None and self.environment != self.environments.describe(),
                'capabilities':self.report['capabilities'] if self.report and self.report['environment'] == self.environments.describe() else None}

    def binding(self):
        with self.environments.lock, self.lock:
            state = self.describe()
            if state['stale']:
                raise ValueError('Compute environment changed. Check capabilities and apply an execution profile for this environment before running.')
            adapter, environment = self.environments.binding()
            environment['execution'] = dict(self.profile)
            environment['execution_revision'] = self.revision
            # Preserve the legacy default until the user applies a checked profile.
            if self.environment is None:
                return adapter, environment
            return BoundExecutionAdapter(adapter, self.profile), environment

    def discover(self, python_runs):
        if not self.probe_lock.acquire(blocking=False):
            raise ValueError('An execution capability check is already running.')
        try:
            with self.environments.lock:
                environment = self.environments.describe()
                settings = self.environments.snapshot()
            code = Path(__file__).with_name('execution_capabilities.py').read_text()
            probe = code + '\nimport flagquantum as fq,json\nprint(json.dumps(execution_capabilities(fq)))\n'
            try:
                with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
                    process = subprocess.run(python_runs.command(probe, settings=settings),
                        stdin=subprocess.DEVNULL, stdout=output, stderr=errors, timeout=45,
                        env={**os.environ, 'OMP_NUM_THREADS':'2','MKL_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2'})
                    if process.returncode:
                        errors.seek(max(0, errors.tell() - 800))
                        raise ValueError('Capability check failed. ' + errors.read(800).decode(errors='replace'))
                    output.seek(0)
                    raw = output.read(131073)
                if len(raw) > 131072:
                    raise ValueError('Capability report exceeded the response limit.')
                capabilities = json.loads(raw.decode().strip().splitlines()[-1])
                if not isinstance(capabilities, dict) or capabilities.get('schema') != 'flagqai.execution-capabilities.v1':
                    raise ValueError('SDK returned an unsupported capability report.')
            except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError, UnicodeError, IndexError) as error:
                raise ValueError('Cannot inspect this compute environment. No QPU or model request was made.') from error
            with self.environments.lock, self.lock:
                if environment != self.environments.describe():
                    raise ValueError('Compute environment changed during the check. Check again.')
                self.report = {'environment':environment, 'capabilities':capabilities}
                self.checked_at = time.monotonic()
                return self.describe()
        finally:
            self.probe_lock.release()

    def activate(self, data):
        if not isinstance(data, dict):
            raise ValueError('Provide an execution activation request.')
        profile = validate_profile(data.get('profile'))
        with self.environments.lock, self.lock:
            current = self.environments.describe()
            revisions = (data.get('expected_revision'), data.get('environment_revision'))
            if any(type(revision) is not int for revision in revisions) or revisions != (self.revision, current['revision']):
                raise ValueError('Execution or compute settings changed in another window. Refresh before applying.')
            if not self.report or self.report['environment'] != current or time.monotonic() - self.checked_at > 600:
                raise ValueError('Check capabilities in this environment before applying the profile.')
            devices = self.report['capabilities']['devices']
            if not any(device['id'] == profile['device'] and any(method['id'] == profile['method'] and method['available'] for method in device['methods']) for device in devices):
                raise ValueError('This device and simulation method did not pass the capability check.')
            saved = {'profile':profile, 'revision':self.revision+1, 'environment':current}
            descriptor, filename = tempfile.mkstemp(prefix='.execution-profile-', dir=self.path.parent)
            try:
                with os.fdopen(descriptor, 'w', encoding='utf-8') as file:
                    json.dump(saved, file)
                os.replace(filename, self.path)
            finally:
                Path(filename).unlink(missing_ok=True)
            self.profile, self.revision, self.environment = profile, saved['revision'], current
            return self.describe()
