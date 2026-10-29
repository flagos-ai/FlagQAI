"""Optional local FlagQuantum/PyTorch CPU adapter. Never falls back to SSH."""
import json
from pathlib import Path
import os
import subprocess
import sys


class LocalCPUAdapter:
    transport = 'local'

    def __init__(self, python=None):
        self.python = python or sys.executable

    def execute(self, request):
        root = Path(__file__).resolve().parent
        driver = (root/'model_metadata.py').read_text() + '\n' + (root/'remote_worker.py').read_text()
        process = subprocess.run([self.python, '-c', driver], input=json.dumps(request), text=True,
                                 capture_output=True, timeout=90,
                                 env={**os.environ, 'OMP_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2'})
        try: payload = json.loads(process.stdout)
        except ValueError: raise RuntimeError('Local FlagQuantum worker did not return a result. Configure FQ_LOCAL_PYTHON with FlagQuantum and PyTorch installed.')
        if not payload.get('ok') or process.returncode:
            raise RuntimeError('Local CPU: ' + str(payload.get('error', 'Worker failed.')))
        return payload['result']
