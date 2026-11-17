"""Verify one reviewed candidate and publish the evidence while holding its lease."""
import io
import os
from pathlib import Path, PurePosixPath
import signal
from shutil import copyfileobj
import subprocess
import sys
from tempfile import TemporaryDirectory, TemporaryFile
import time
from types import SimpleNamespace
import zipfile

# Isolated Python omits the script directory from its module search path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from workspace_server.invsqrt_evidence import (
    REPORT_LIMIT, read_json, read_report_export, regular_bytes, regular_file_bytes,
)
from workspace_server.research_execution import EXPECTED_SHOTS, comparison_baseline, pinned_code
from workspace_server.research_candidates import digest
from workspace_server.research_recovery import save_report, write_atomic

MAX_PACKAGE_BYTES = 128 * 1024 * 1024
MAX_UNPACKED_BYTES = 2 * 1024 * 1024 * 1024


def verify(settings, directory, lease, report):
    import kickmix as km

    proposal = report['proposal']
    source = regular_file_bytes(directory, 'candidate.kmx', REPORT_LIMIT)
    if digest(source) != proposal['source_sha256']:
        raise ValueError('Reviewed candidate source changed.')
    files = pinned_code(directory)
    baseline = comparison_baseline(settings, report)
    package = read_report_export(settings, baseline, 'submission.zip')
    variant = report['variants'][0]
    for name, expected, limit in (
        ('baseline.kmb', variant['sha256'], 64 * 1024 * 1024),
        ('baseline.stdout.json', variant['report_sha256'], REPORT_LIMIT),
    ):
        if digest(regular_file_bytes(directory, name, limit)) != expected:
            raise ValueError('Staged baseline evidence changed.')
    report['execution']['runtime'] = {
        'python': sys.version.split()[0],
        'kickmix_sha256': digest(regular_bytes(Path(km.__file__).resolve(), 128 * 1024 * 1024)),
    }
    workers = report.get('settings', {}).get('max_workers', 2)
    if type(workers) is not int or not 1 <= workers <= 16:
        raise ValueError('Invalid archived verification worker count.')

    with TemporaryDirectory(prefix='flagqai-invsqrt-') as temporary:
        root = Path(temporary).resolve()
        for name, raw in files.items():
            (root / name).write_bytes(raw)
        circuit = km.Circuit.from_file(io.BytesIO(source), format='kmx')
        circuit.to_file(str(root / 'candidate.kmb'), format='kmb')
        candidate = regular_bytes(root / 'candidate.kmb', 64 * 1024 * 1024)
        archive = submission_package(package, candidate)
        command = [sys.executable, '-I', 'verifier.py', 'candidate.kmb', '--max-workers', str(workers)]
        started = time.monotonic()
        with (root / 'candidate.stdout.json').open('wb') as stdout, (root / 'candidate.stderr.log').open('wb') as stderr:
            process = subprocess.Popen(
                command, cwd=root, stdout=stdout, stderr=stderr, start_new_session=True,
                pass_fds=(lease,),
            )
            try:
                returncode = process.wait(timeout=1800)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise ValueError('The local verifier exceeded its 30-minute limit.') from None

        raw_output = regular_bytes(root / 'candidate.stdout.json', REPORT_LIMIT)
        write_atomic(directory, 'candidate.stdout.json', raw_output)
        write_atomic(directory, 'candidate.stderr.log', regular_bytes(root / 'candidate.stderr.log', REPORT_LIMIT))
        output = read_json(raw_output)
        passed = (returncode == 0 and output.get('status') == 'PASS' and
                  output.get('verified_shots') == EXPECTED_SHOTS and
                  output.get('circuit_sha256') == digest(candidate))
        report['variants'].append({
            'name': 'candidate', 'passed': passed, 'seconds': time.monotonic() - started,
            'command': command, 'sha256': digest(candidate),
            'report_sha256': digest(raw_output), 'report': output, 'exit_code': returncode,
        })
        if not passed:
            raise ValueError('Full InvSqrt verification failed. See the saved verifier output.')

    if digest(regular_file_bytes(directory, 'candidate.kmx', REPORT_LIMIT)) != proposal['source_sha256']:
        raise ValueError('Reviewed candidate source changed during verification.')
    write_atomic(directory, 'candidate.kmb', candidate)
    write_atomic(directory, 'submission.zip', archive)
    report['exports'] = []
    for name in ('submission.zip', 'baseline.kmb', 'candidate.kmb', 'candidate.kmx',
                 'verifier.py', 'official-metric.py', 'baseline.stdout.json', 'candidate.stdout.json'):
        raw = regular_file_bytes(directory, name, 128 * 1024 * 1024)
        report['exports'].append({'name': name, 'sha256': digest(raw), 'size': len(raw)})
    proposal['verified_source_sha256'] = digest(source)
    report['status'] = 'completed'


def submission_package(existing, candidate):
    with zipfile.ZipFile(io.BytesIO(existing)) as old, TemporaryFile() as output:
        entries = old.infolist()
        names = {item.filename for item in entries}
        if (len(names) != len(entries) or 'invsqrt.kmb' not in names
                or sum(item.file_size for item in entries if item.filename != 'invsqrt.kmb')
                    + len(candidate) > MAX_UNPACKED_BYTES
                or any(path.is_absolute() or '..' in path.parts or '\\' in name
                       for name in names for path in [PurePosixPath(name)])):
            raise ValueError('Invalid archived submission package.')
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as new:
            for item in entries:
                if item.filename == 'invsqrt.kmb':
                    new.writestr(item.filename, candidate)
                else:
                    with old.open(item) as source, new.open(item.filename, 'w') as destination:
                        copyfileobj(source, destination, length=1024 * 1024)
                if output.tell() > MAX_PACKAGE_BYTES:
                    raise ValueError('The verified submission package exceeds 128 MiB.')
        if output.tell() > MAX_PACKAGE_BYTES:
            raise ValueError('The verified submission package exceeds 128 MiB.')
        output.seek(0)
        return output.read()


def main():
    root, identity, directory, lease = sys.argv[1:]
    directory, lease = int(directory), int(lease)
    os.fstat(lease)
    settings = SimpleNamespace(database_path=Path(root).parent / 'jobs.sqlite3')
    report = read_json(regular_file_bytes(directory, 'report.json', REPORT_LIMIT))
    if report['id'] != identity or report['status'] != 'running':
        raise ValueError('The verification record is unavailable.')
    original_variants = list(report['variants'])
    try:
        verify(settings, directory, lease, report)
    except Exception as error:
        report['status'] = 'failed'
        report['exports'] = []
        report['error'] = str(error)
    try:
        try:
            save_report(directory, report)
        except ValueError:
            report['status'] = 'failed'
            report['exports'] = []
            report['variants'] = original_variants
            report['error'] = 'Verification evidence exceeded the report limit.'
            save_report(directory, report)
    finally:
        os.close(lease)
        os.close(directory)


if __name__ == '__main__':
    main()
