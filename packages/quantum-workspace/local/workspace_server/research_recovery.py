"""File-backed execution state and process-owned verification leases."""
from datetime import datetime, timezone
import json
import os
import stat
from uuid import uuid4

from .invsqrt_evidence import REPORT_LIMIT, evidence_directory, read_json, regular_file_bytes


def write_atomic(directory, name, raw):
    temporary = '.write-' + uuid4().hex
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=directory)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass


def save_report(directory, report):
    raw = json.dumps(report, allow_nan=False).encode()
    if len(raw) > REPORT_LIMIT:
        raise ValueError('Verification report exceeds 2 MiB.')
    write_atomic(directory, 'report.json', raw)


def acquire_lease(directory):
    from fcntl import LOCK_EX, LOCK_NB, flock
    descriptor = os.open(
        '.verification.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK,
        0o600, dir_fd=directory,
    )
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError('Invalid candidate verification lease.')
        flock(descriptor, LOCK_EX | LOCK_NB)
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def recover_report(path, report):
    if report['status'] != 'running' or report.get('execution', {}).get('protocol') != 'lease-v1':
        return report
    with evidence_directory(path.parent) as directory:
        try:
            lease = acquire_lease(directory)
        except BlockingIOError:
            return report
        try:
            current = read_json(regular_file_bytes(directory, path.name, REPORT_LIMIT))
            if current['id'] != report['id']:
                raise ValueError('Verification record changed identity.')
            if current['status'] == 'running':
                current['status'] = 'interrupted'
                current['error'] = 'Verification was interrupted. Stage a new revision to try again.'
                current['execution']['interrupted_at'] = datetime.now(timezone.utc).isoformat()
                save_report(directory, current)
            return current
        finally:
            os.close(lease)
