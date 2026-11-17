"""Read local InvSqrt verifier evidence without executing uploaded code."""
from contextlib import contextmanager
import hashlib
import json
from math import isfinite
import os
from pathlib import Path
import re
import stat

REPORT_LIMIT = 2 * 1024 * 1024
IDENTITY = re.compile(r"[a-f0-9]{32}")
EXPORT_NAME = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}")
VARIANTS = {"baseline", "candidate"}


def evidence_root(settings):
    return settings.database_path.parent / 'invsqrt'


@contextmanager
def evidence_directory(path):
    parts = Path(path).absolute().parts
    directory = os.open(parts[0], os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=directory)
            os.close(directory)
            directory = child
        yield directory
    finally:
        os.close(directory)


def regular_bytes(path, limit):
    with evidence_directory(path.parent) as directory:
        return regular_file_bytes(directory, path.name, limit)


def regular_file_bytes(directory, name, limit):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                         dir_fd=directory)
    with os.fdopen(descriptor, 'rb') as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
            raise ValueError('Evidence must be a bounded regular file.')
        raw = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    if len(raw) > limit or (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
        raise ValueError('Evidence changed while reading.')
    return raw


def evidence_ids(settings):
    try:
        with evidence_directory(evidence_root(settings)) as directory:
            return {name for name in os.listdir(directory) if IDENTITY.fullmatch(name)}
    except FileNotFoundError:
        return set()


def finite_float(value):
    result = float(value)
    if not isfinite(result):
        raise ValueError('Evidence contains a non-finite number.')
    return result


def read_json(raw):
    value = json.loads(raw, parse_float=finite_float, parse_constant=finite_float)
    if not isinstance(value, dict):
        raise ValueError('Evidence must contain a JSON object.')
    return value


def read_report(settings, identity=None, *, allow_current=True):
    root = evidence_root(settings)
    if identity is not None and not IDENTITY.fullmatch(identity):
        raise ValueError('Invalid evidence identity.')
    path = root / identity / 'report.json' if identity else root / 'current.json'
    try:
        report = read_json(regular_bytes(path, REPORT_LIMIT))
    except FileNotFoundError:
        if identity and allow_current:
            current = read_report(settings)
            return current if current and current['id'] == identity else None
        return None
    report_id = report.get('id')
    if not isinstance(report_id, str) or not IDENTITY.fullmatch(report_id):
        raise ValueError('Invalid evidence identity.')
    if identity and report_id != identity:
        raise ValueError('Evidence identity mismatch.')
    if not isinstance(report.get('status'), str) or not isinstance(report.get('created_at'), str):
        raise ValueError('Invalid research record status or date.')
    if identity and report['status'] == 'running':
        from .research_recovery import recover_report
        report = recover_report(path, report)
    variants = report.get('variants', [])
    exports = report.get('exports', [])
    if (not isinstance(variants, list) or
            any(not isinstance(item, dict) or item.get('name') not in ('baseline', 'candidate') or
                not isinstance(item.get('report'), dict) for item in variants)):
        raise ValueError('Invalid verifier variants.')
    if (not isinstance(exports, list) or
            any(not isinstance(item, dict) or not isinstance(item.get('name'), str) or
                not EXPORT_NAME.fullmatch(item['name']) or
                not isinstance(item.get('sha256'), str) or
                not re.fullmatch(r'[a-f0-9]{64}', item['sha256']) for item in exports) or
            len({item['name'] for item in exports}) != len(exports)):
        raise ValueError('Invalid evidence exports.')
    if report.get('proposal'):
        source = regular_bytes(root / report_id / 'candidate.kmx', REPORT_LIMIT)
        if hashlib.sha256(source).hexdigest() != report['proposal']['source_sha256']:
            raise ValueError('Reviewed source hash mismatch.')
    if report.get('status') == 'completed':
        if len(variants) != 2 or {item['name'] for item in variants} != VARIANTS:
            raise ValueError('Both full verifier reports are required.')
        for variant in variants:
            path = root / report_id / (variant['name'] + '.stdout.json')
            raw = regular_bytes(path, REPORT_LIMIT)
            if (read_json(raw) != variant['report'] or
                    hashlib.sha256(raw).hexdigest() != variant['report_sha256']):
                raise ValueError('Verifier report hash mismatch.')
            if (variant['report'].get('status') != 'PASS' or
                    variant['report'].get('verified_shots') != 200540928 or
                    variant['report'].get('circuit_sha256') != variant['sha256']):
                raise ValueError('Complete circuit verification is required.')
            circuit = regular_bytes(root / report_id / (variant['name'] + '.kmb'),
                                    64 * 1024 * 1024)
            if hashlib.sha256(circuit).hexdigest() != variant['sha256']:
                raise ValueError('Circuit hash mismatch.')
    return report


def read_export(settings, identity, name):
    return read_report_export(settings, read_report(settings, identity), name)


def read_report_export(settings, report, name):
    if not EXPORT_NAME.fullmatch(name):
        raise ValueError('Invalid evidence export name.')
    if not report or report.get('status') != 'completed':
        raise ValueError('Completed evidence is unavailable.')
    entry = next((item for item in report['exports'] if item['name'] == name), None)
    if not entry:
        raise ValueError('Export is unavailable.')
    raw = regular_bytes(evidence_root(settings) / report['id'] / name, 128 * 1024 * 1024)
    if hashlib.sha256(raw).hexdigest() != entry['sha256']:
        raise ValueError('Export hash mismatch.')
    return raw
