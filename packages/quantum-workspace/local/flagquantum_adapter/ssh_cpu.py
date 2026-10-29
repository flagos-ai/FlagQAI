"""Trusted fixed driver over SSH; circuit source is data, never shell/Python code."""
import base64
import json
from pathlib import Path
import subprocess


class SSHCPUAdapter:
    def __init__(self, target, port=2222):
        self.target = target
        self.port = port

    def execute(self, request):
        if not self.target:
            raise RuntimeError('Configure FQ_SSH_TARGET or .local/settings.json before computing.')
        root = Path(__file__).resolve().parent
        driver = base64.b64encode(
            (root/'model_metadata.py').read_bytes() + b'\n' +
            (root/'remote_worker.py').read_bytes()
        ).decode()
        data = base64.b64encode(json.dumps(request).encode()).decode()
        script = (
            'import base64,io,sys\n'
            f"sys.stdin=io.StringIO(base64.b64decode('{data}').decode())\n"
            f"exec(compile(base64.b64decode('{driver}'),'<workspace-driver>','exec'))\n"
        )
        command = [
            'ssh', '-T', '-p', str(self.port), '-o', 'BatchMode=yes',
            '-o', 'ConnectTimeout=12', '-o', 'ConnectionAttempts=1',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no',
            '-o', 'ForwardX11=no', self.target,
            'OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 timeout 90s python3 -',
        ]
        try:
            result = subprocess.run(command, input=script, text=True, capture_output=True, timeout=105)
        except subprocess.TimeoutExpired as error:
            raise RuntimeError('Remote execution timed out. The remote process has a 90-second limit.') from error
        try:
            body = json.loads(result.stdout.strip().splitlines()[-1])
        except (ValueError, IndexError) as error:
            detail = result.stderr.strip()[-1000:] or 'No valid result returned.'
            raise RuntimeError('SSH or remote worker failed: '+detail) from error
        if result.returncode or not body.get('ok'):
            raise RuntimeError(body.get('error', 'Remote execution failed.'))
        return body['result']
