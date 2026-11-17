"""Project baseline pointers with atomic, revision-checked adoption history."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import stat
from uuid import uuid4

from .invsqrt_evidence import (
    REPORT_LIMIT, evidence_directory, evidence_root, read_json, read_report,
    read_report_export, regular_file_bytes,
)

_FILENAME = 'project-baseline.json'
_HASH = re.compile(r'[a-f0-9]{64}')
_RUN_ID = re.compile(r'invsqrt-[a-f0-9]{32}')


def project_baseline(settings):
    try:
        with evidence_directory(evidence_root(settings)) as directory:
            return read_baseline(directory)
    except FileNotFoundError:
        return {'revision': 0, 'current': None, 'history': []}


def read_baseline(directory):
    try:
        state = read_json(regular_file_bytes(directory, _FILENAME, REPORT_LIMIT))
    except FileNotFoundError:
        return {'revision': 0, 'current': None, 'history': []}
    if (type(state.get('revision')) is not int or state['revision'] < 0 or
            not isinstance(state.get('history'), list) or state['revision'] != len(state['history'])):
        raise ValueError('Invalid project baseline history.')
    previous = None
    request_ids = set()
    for revision, event in enumerate(state['history'], 1):
        if (not isinstance(event, dict) or event.get('revision') != revision or
                event.get('action') not in ('adopt', 'restore') or
                not isinstance(event.get('request_id'), str) or event['request_id'] in request_ids or
                not valid_hash(event.get('fingerprint')) or
                not valid_target(event.get('target')) or event.get('previous') != previous):
            raise ValueError('Invalid project baseline decision chain.')
        request_ids.add(event['request_id'])
        previous = event['target']
    if not state['history'] and state.get('current') is not None:
        raise ValueError('Project baseline has no adoption history.')
    if state['history'] and state.get('current') != state['history'][-1]['target']:
        raise ValueError('Project baseline and history do not agree.')
    return state


def valid_hash(value):
    return isinstance(value, str) and _HASH.fullmatch(value) is not None


def valid_target(target):
    return (isinstance(target, dict) and isinstance(target.get('run_id'), str)
            and _RUN_ID.fullmatch(target['run_id']) is not None
            and all(valid_hash(target.get(key)) for key in (
                'source_sha256', 'circuit_sha256', 'report_sha256'))
            and isinstance(target.get('metrics'), dict))


def check_revision(state, expected):
    if type(expected) is not int or expected != state['revision']:
        raise ValueError('Project baseline changed in another window. Reload the project baseline and review again.')


def verified_version(settings, identity):
    if not isinstance(identity, str) or not _RUN_ID.fullmatch(identity):
        raise ValueError('Choose a verified research version.')
    report = read_report(settings, identity.removeprefix('invsqrt-'), allow_current=False)
    return verified_report_version(settings, report)


def verified_report_version(settings, report):
    if not report or report['status'] != 'completed':
        raise ValueError('Only a fully verified version can become the project baseline.')
    source_hash = hashlib.sha256(read_report_export(settings, report, 'candidate.kmx')).hexdigest()
    if report.get('proposal') and report['proposal']['source_sha256'] != source_hash:
        raise ValueError('Verified source version changed.')
    candidate = next(item for item in report['variants'] if item['name'] == 'candidate')
    return {
        'run_id': 'invsqrt-' + report['id'], 'source_sha256': source_hash,
        'circuit_sha256': candidate['sha256'], 'report_sha256': candidate['report_sha256'],
        'metrics': candidate['report'],
    }


def update_baseline(settings, identity, data):
    if not isinstance(data, dict) or set(data) != {
        'decision', 'source_sha256', 'expected_project_revision', 'request_id',
    }:
        raise ValueError('Include the decision, source hash, baseline revision, and request ID.')
    key = data['request_id']
    if not isinstance(key, str) or not 1 <= len(key) <= 128:
        raise ValueError('A stable baseline decision request ID is required.')
    if not valid_hash(data['source_sha256']):
        raise ValueError('Review a candidate with a valid source SHA-256.')
    if data['decision'] not in ('adopt', 'restore'):
        raise ValueError('Choose adopt or restore.')

    with research_control_lock(settings) as directory:
        return decide_baseline(settings, identity, data, directory)


@contextmanager
def research_control_lock(settings):
    from fcntl import LOCK_EX, flock

    with evidence_directory(evidence_root(settings)) as directory:
        descriptor = os.open(
            '.control.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK,
            0o600, dir_fd=directory,
        )
        with os.fdopen(descriptor, 'rb+') as lock:
            info = os.fstat(lock.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise ValueError('Invalid project baseline lock file.')
            flock(lock.fileno(), LOCK_EX)
            yield directory


def decide_baseline(settings, identity, data, directory):
    state = read_baseline(directory)
    key = data['request_id']
    fingerprint = hashlib.sha256(json.dumps({**data, 'run_id': identity}, sort_keys=True).encode()).hexdigest()
    previous = next((event for event in state['history'] if event['request_id'] == key), None)
    if previous:
        if previous['fingerprint'] != fingerprint:
            raise ValueError('Baseline request ID already belongs to another decision.')
        return state  # Never reinstate an old decision after a later rollback.
    check_revision(state, data.get('expected_project_revision'))
    target = verified_version(settings, identity)
    if data.get('source_sha256') != target['source_sha256']:
        raise ValueError('The candidate version changed. Review it again.')
    action = data['decision']
    if action == 'restore' and not any(event['target'] == target for event in state['history']):
        raise ValueError('Only a previously adopted verified version can be restored.')
    if state['current'] == target:
        raise ValueError('This version is already the project baseline.')
    event = {
        'revision': state['revision'] + 1, 'request_id': key, 'fingerprint': fingerprint,
        'action': action, 'at': datetime.now(timezone.utc).isoformat(),
        'previous': state['current'], 'target': target,
    }
    updated = {'revision': event['revision'], 'current': target, 'history': [*state['history'], event]}
    payload = json.dumps(updated, allow_nan=False).encode()
    if len(payload) > REPORT_LIMIT:
        raise ValueError('Project baseline history exceeds the storage limit.')
    temporary = '.baseline-' + uuid4().hex
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=directory)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, _FILENAME, src_dir_fd=directory, dst_dir_fd=directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass
    return updated
