"""Run each editable copy, independent comparison and saved-circuit replay locally.

Usage: PYTHONPATH=<pinned SDK root> <python> verify.py <evidence-directory>
This never calls an Agent or model provider.
"""
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from tempfile import mkdtemp

web = Path(__file__).resolve().parents[2]
catalog = json.loads((web / 'src/data/synthesis-catalog.json').read_text())
evidence = Path(sys.argv[1]).resolve()
evidence.mkdir(parents=True, exist_ok=True)
evidence = Path(mkdtemp(prefix='attempt-', dir=evidence))
print('Evidence:', evidence, flush=True)
results = []
for item in catalog['entries']:
    if 'source' not in item:
        continue
    if hashlib.sha256(item['source'].encode()).hexdigest() != item['sourceSha256']:
        raise ValueError('Catalog source hash mismatch: ' + item['id'])
    folder = evidence / item['path']
    folder.mkdir(parents=True, exist_ok=True)
    source = folder / 'main.py'
    source.write_text(item['source'])
    started = time.monotonic()
    record = {'id': item['id'], 'sourceSha256': item['sourceSha256'], 'checks': {}}
    for check, args in [
        ('run', [str(source)]),
        ('comparison', ['-m', item['comparison']]),
        ('savedReplay', ['-c', 'import flagquantum as fq; import torch; '
            f'a=fq.load({item["filename"]!r}); r=fq.run(a.program); '
            'torch.testing.assert_close(r.statevector(), a.result.statevector(), atol=1e-10, rtol=0); '
            'print("Saved circuit replay matches archived result")']),
    ]:
        try:
            completed = subprocess.run([sys.executable, *args], cwd=folder, env=os.environ.copy(),
                                       capture_output=True, text=True, timeout=120)
            (folder / (check + '.log')).write_text(completed.stdout + completed.stderr)
            record['checks'][check] = {'passed': completed.returncode == 0, 'exitCode': completed.returncode}
        except subprocess.TimeoutExpired:
            record['checks'][check] = {'passed': False, 'reason': '120-second timeout'}
        if not record['checks'][check]['passed']:
            break
    record['elapsedSeconds'] = round(time.monotonic() - started, 3)
    record['passed'] = len(record['checks']) == 3 and all(check['passed'] for check in record['checks'].values())
    artifact = folder / item['filename']
    if artifact.exists():
        record['artifactSha256'] = hashlib.sha256(artifact.read_bytes()).hexdigest()
    results.append(record)
    print(item.get('title'), 'PASS' if record['passed'] else 'FAIL', flush=True)
import flagquantum as fq
sdk_root = Path(fq.__file__).resolve().parent
digest = hashlib.sha256()
for file in sorted(sdk_root.rglob('*')):
    if file.is_file() and not file.is_symlink() and file.suffix in ('.py', '.so', '.pyd', '.dylib'):
        digest.update(file.relative_to(sdk_root).as_posix().encode() + bytes([0]))
        digest.update(hashlib.sha256(file.read_bytes()).digest())
report = {'revision': catalog['revision'], 'sdkVersion': fq.__version__,
          'sdkRoot': str(sdk_root), 'python': sys.version,
          'sdkCodeSha256': digest.hexdigest(), 'recordedAt': datetime.now(timezone.utc).date().isoformat(),
          'scope': 'Recorded local acceptance; does not certify the current execution environment.',
          'results': results, 'passed': all(item['passed'] for item in results)}
(evidence / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
sys.exit(0 if report['passed'] else 1)
