"""Explicit, persistent compute selection; queued work keeps immutable settings."""
from dataclasses import replace
import json
import os
import re
import subprocess
import tempfile
import secrets
import sys
import threading
import time
from pathlib import Path
from flagquantum_adapter.local_cpu import LocalCPUAdapter
from flagquantum_adapter.ssh_cpu import SSHCPUAdapter


class ComputeEnvironments:
    def __init__(self, settings):
        self.base = settings
        self.path = settings.database_path.parent / 'compute-environment.json'
        self.lock = threading.RLock()
        self.checked = {}
        self.probe_lock = threading.Lock()
        self.revision = 0
        self.config = dict(transport=settings.compute_transport,
            local_python=settings.local_python or sys.executable,
            remote_python=settings.remote_python or 'python3',
            ssh_target=settings.ssh_target or '', ssh_port=settings.ssh_port, ssh_identity=settings.ssh_identity)
        if self.path.exists():
            saved = json.loads(self.path.read_text())
            self.config = self.validate(saved['config'])
            self.revision = saved['revision']
            if type(self.revision) is not int or self.revision < 0:
                raise ValueError('Invalid saved compute environment revision.')

    @staticmethod
    def validate(data):
        if not isinstance(data, dict) or set(data) - {'ssh_identity'} != {'transport', 'local_python', 'remote_python', 'ssh_target', 'ssh_port'}:
            raise ValueError('Provide the complete compute configuration.')
        if data['transport'] not in ('local', 'ssh'):
            raise ValueError('Choose local or SSH.')
        for key in ('local_python', 'remote_python'):
            if not isinstance(data[key], str) or not re.fullmatch(r'[A-Za-z0-9_./+ :~-]{1,512}', data[key]) or data[key].startswith('-'):
                raise ValueError('Use a Python executable path, without arguments.')
        if not isinstance(data['ssh_target'], str) or len(data['ssh_target']) > 253 or (data['ssh_target'] and not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.:-]*(?:@[A-Za-z0-9_][A-Za-z0-9_.:-]*)?', data['ssh_target'])):
            raise ValueError('Use an SSH host alias or user@host, without options.')
        if type(data['ssh_port']) is not int or not 1 <= data['ssh_port'] <= 65535:
            raise ValueError('SSH port must be between 1 and 65535.')
        if data['transport'] == 'ssh' and not data['ssh_target']:
            raise ValueError('Configure an SSH host first.')
        identity = data.get('ssh_identity', '')
        if not isinstance(identity, str) or len(identity) > 4096 or identity.startswith('-') or any(ord(c) < 32 or ord(c) == 127 for c in identity):
            raise ValueError('Use a local identity file path.')
        return {**data, 'ssh_identity':identity}

    def snapshot(self):
        with self.lock:
            return replace(self.base, compute_transport=self.config['transport'],
                **{key: self.config[key] for key in ('local_python','remote_python','ssh_target','ssh_port','ssh_identity')})

    def describe(self):
        with self.lock:
            return {'config':dict(self.config), 'revision':self.revision}

    def binding(self):
        with self.lock:
            return self.adapter(), self.describe()

    def adapter(self):
        settings = self.snapshot()
        return (LocalCPUAdapter(settings.local_python) if settings.compute_transport == 'local'
                else SSHCPUAdapter(settings.ssh_target, settings.ssh_port, settings.remote_python, settings.ssh_identity))

    def check(self, config, python_runs):
        if not self.probe_lock.acquire(blocking=False):
            raise ValueError('An environment check is already running.')
        try:
            return self._check(config, python_runs)
        finally:
            self.probe_lock.release()

    def _check(self, config, python_runs):
        config = self.validate(config)
        with self.lock:
            checked_revision = self.revision
        settings = replace(self.base, compute_transport=config['transport'],
            **{key: config[key] for key in ('local_python','remote_python','ssh_target','ssh_port','ssh_identity')})
        facts = (Path(__file__).parent / 'runtime_facts.py').read_text()
        smoke = """
import tempfile
from pathlib import Path
import flagquantum as fq
import json
result = fq.run(fq.Circuit(1).x(0), outputs=fq.counts(), options=fq.ExecutionOptions(shots=8, seed=42))
with tempfile.TemporaryDirectory(prefix='fq-environment-check-') as directory:
    archive = Path(directory) / 'check.fqx'
    fq.save(str(archive), result.plan, result=result)
    if fq.load(str(archive)).result.counts != result.counts:
        raise RuntimeError('Archive round trip failed.')
print(json.dumps(runtime_manifest(fq)))
"""
        probe = facts + smoke
        try:
            with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
                result = subprocess.run(python_runs.command(probe, settings=settings),
                    stdin=subprocess.DEVNULL, stdout=output, stderr=errors, timeout=30,
                    env={**os.environ, 'OMP_NUM_THREADS':'2', 'MKL_NUM_THREADS':'2', 'OPENBLAS_NUM_THREADS':'2'})
                if result.returncode:
                    errors.seek(max(0, errors.tell() - 800))
                    detail = errors.read(800).decode(errors='replace').strip()
                    raise ValueError('Environment check failed. Check SSH access, the Python path and installed FlagQuantum dependencies. ' + detail)
                output.seek(0)
                raw = output.read(65537)
            if len(raw) > 65536:
                raise ValueError('Environment check returned too much output.')
            manifest = json.loads(raw.decode().strip().splitlines()[-1])
            if not isinstance(manifest, dict) or not isinstance(manifest.get('python'), str):
                raise ValueError('Environment check returned an invalid runtime report.')
        except (OSError, subprocess.TimeoutExpired, IndexError, UnicodeError, json.JSONDecodeError) as error:
            raise ValueError('Environment check could not complete. No fallback or task submission occurred.') from error
        identity = secrets.token_urlsafe(24)
        with self.lock:
            if checked_revision != self.revision:
                raise ValueError('Compute environment changed during the check. Check again.')
            if len(self.checked) >= 32:
                self.checked.clear()
            self.checked[identity] = (time.monotonic(), config, checked_revision)
        return {'ok':True, 'check_id':identity, 'runtime':manifest}

    def activate(self, data):
        if not isinstance(data, dict):
            raise ValueError('Provide a compute activation request.')
        config = self.validate(data.get('config'))
        with self.lock:
            expected = data.get('expected_revision')
            if type(expected) is not int or expected != self.revision:
                raise ValueError('Compute environment changed in another window. Reopen and check it again.')
            key = data.get('check_id')
            receipt = self.checked.get(key) if isinstance(key, str) else None
            if not receipt or receipt[1:] != (config, self.revision) or time.monotonic() - receipt[0] > 600:
                raise ValueError('Check this exact environment before using it.')
            saved = {'config':config, 'revision':self.revision + 1}
            self.path.parent.mkdir(parents=True, exist_ok=True)
            descriptor, filename = tempfile.mkstemp(prefix='.compute-environment-', dir=self.path.parent)
            try:
                with os.fdopen(descriptor, 'w', encoding='utf-8') as file:
                    json.dump(saved, file)
                os.replace(filename, self.path)
            finally:
                Path(filename).unlink(missing_ok=True)
            self.config, self.revision = config, saved['revision']
            self.checked.clear()
            return self.describe()
