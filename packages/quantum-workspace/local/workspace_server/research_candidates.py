"""Stage immutable circuit patches for explicit review."""
from datetime import datetime, timezone
import difflib
import hashlib
import json
import os
import re
from uuid import uuid4

from .invsqrt_evidence import (
    REPORT_LIMIT, evidence_root, read_report, read_report_export, regular_bytes,
)
from .research_baseline import (
    check_revision, read_baseline, research_control_lock, valid_hash, verified_report_version,
)

RUN_ID = re.compile(r'invsqrt-([a-f0-9]{32})')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def archived_report(settings, identity):
    match = RUN_ID.fullmatch(identity) if isinstance(identity, str) else None
    if not match:
        raise ValueError('Choose an archived research run.')
    report = read_report(settings, match[1], allow_current=False)
    if not report:
        raise ValueError('The selected research archive is unavailable.')
    return report


def candidate_source(settings, report):
    if report['status'] == 'completed':
        return read_report_export(settings, report, 'candidate.kmx')
    if report['status'] in ('failed', 'interrupted', 'rejected') and report.get('proposal'):
        raw = regular_bytes(evidence_root(settings) / report['id'] / 'candidate.kmx',
                            REPORT_LIMIT)
        if digest(raw) == report['proposal']['source_sha256']:
            return raw
    raise ValueError('Choose a verified version or a recorded candidate attempt.')


def baseline_inputs(settings, report):
    if report['status'] != 'completed':
        raise ValueError('The baseline needs full passing verification.')
    candidate = next(v for v in report['variants'] if v['name'] == 'candidate')
    files = {}
    for source, target, expected in (
        ('candidate.kmb', 'baseline.kmb', candidate['sha256']),
        ('candidate.stdout.json', 'baseline.stdout.json', candidate['report_sha256']),
        ('verifier.py', 'verifier.py', report.get('provenance', {}).get('verifier_sha256')),
        ('official-metric.py', 'official-metric.py', report.get('provenance', {}).get('metric_sha256')),
    ):
        raw = read_report_export(settings, report, source)
        if digest(raw) != expected:
            raise ValueError('Baseline evidence changed while staging the revision.')
        files[target] = raw
    return {**candidate, 'name': 'baseline'}, files


def write_revision(directory, identity, files):
    # Publish all inputs and the review record together. A crash during staging
    # leaves the hidden directory outside the research runs index.
    staging = '.candidate-' + uuid4().hex
    os.mkdir(staging, 0o700, dir_fd=directory)
    descriptor = os.open(staging, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                         dir_fd=directory)
    renamed = False
    try:
        for name, content in files.items():
            handle = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=descriptor)
            with os.fdopen(handle, 'wb') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        os.rename(staging, identity, src_dir_fd=directory, dst_dir_fd=directory)
        renamed = True
    finally:
        if not renamed:
            for name in files:
                try:
                    os.unlink(name, dir_fd=descriptor)
                except FileNotFoundError:
                    pass
        os.close(descriptor)
        if not renamed:
            os.rmdir(staging, dir_fd=directory)


def propose_candidate(settings, parent_id, data):
    if not isinstance(data, dict) or set(data) != {
        'request_id', 'parent_sha256', 'expected_project_revision', 'before', 'after', 'reason',
    }:
        raise ValueError('Include a patch, source hash, baseline revision, and request ID.')
    key, before, after, reason = (data[name] for name in ('request_id', 'before', 'after', 'reason'))
    if not isinstance(key, str) or not 1 <= len(key) <= 128:
        raise ValueError('A stable request ID is required.')
    if not valid_hash(data['parent_sha256']):
        raise ValueError('Review a parent with a valid source SHA-256.')
    if not isinstance(before, str) or not before or len(before.encode()) > 16384:
        raise ValueError('Use a nonempty patch of at most 16 KiB.')
    if not isinstance(after, str) or len(after.encode()) > 16384 or before == after:
        raise ValueError('Use a different replacement of at most 16 KiB.')
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 4000:
        raise ValueError('Explain the candidate change.')

    identity = digest((parent_id + '\n' + key).encode())[:32]
    fingerprint = digest(json.dumps({**data, 'parent': parent_id}, sort_keys=True).encode())
    result = {'research_run': {'id': 'invsqrt-' + identity}}
    with research_control_lock(settings) as directory:
        existing = read_report(settings, identity, allow_current=False)
        if existing:
            if (existing.get('proposal') or {}).get('fingerprint') != fingerprint:
                raise ValueError('Request ID already belongs to another proposal.')
            return result
        try:
            os.stat(identity, dir_fd=directory, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise ValueError('An incomplete archive already occupies this candidate ID.')

        state = read_baseline(directory)
        check_revision(state, data['expected_project_revision'])
        parent = archived_report(settings, parent_id)
        old = candidate_source(settings, parent)
        source_hash = digest(old)
        if source_hash != data['parent_sha256']:
            raise ValueError('Parent code version changed. Review the saved source again.')
        source = old.decode('utf-8')
        index = source.find(before)
        if index < 0 or source.find(before, index + 1) >= 0:
            raise ValueError('The patch must change exactly one unique region.')
        revised = source[:index] + after + source[index + len(before):]
        raw = revised.encode()
        if len(raw) > REPORT_LIMIT:
            raise ValueError('Revised source exceeds 2 MiB.')

        current = state['current']
        if current:
            baseline_parent = archived_report(settings, current['run_id'])
            if verified_report_version(settings, baseline_parent) != current:
                raise ValueError('Project baseline evidence changed.')
        elif parent['status'] == 'completed':
            baseline_parent = parent
        else:
            proposal = parent['proposal']
            baseline_parent = archived_report(settings, proposal.get('baseline_parent') or proposal['parent'])
        variant, files = baseline_inputs(settings, baseline_parent)
        diff = difflib.unified_diff(
            source.splitlines(keepends=True), revised.splitlines(keepends=True),
            fromfile='parent/candidate.kmx', tofile='candidate/candidate.kmx',
        )
        proposal = {
            'parent': parent_id, 'baseline_parent': 'invsqrt-' + baseline_parent['id'],
            'parent_sha256': source_hash, 'source_sha256': digest(raw),
            'project_revision': state['revision'], 'fingerprint': fingerprint,
            'reason': reason, 'decision': 'pending',
            'diff': ''.join(line if line.endswith('\n') else
                            line + '\n\\ No newline at end of file\n' for line in diff),
        }
        report = {
            **baseline_parent, 'id': identity, 'status': 'review', 'exports': [],
            'created_at': datetime.now(timezone.utc).isoformat(), 'variants': [variant],
            'change': {'description': reason}, 'proposal': proposal,
        }
        for field in ('error', 'execution', 'format_preflight'):
            report.pop(field, None)
        payload = json.dumps(report, allow_nan=False).encode()
        if len(payload) > REPORT_LIMIT:
            raise ValueError('The saved review record exceeds 2 MiB.')
        files.update({'candidate.kmx': raw, 'report.json': payload})
        write_revision(directory, identity, files)
    return result
