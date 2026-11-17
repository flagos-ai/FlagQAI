"""Accept an explicit review decision and start at most one verification."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from shutil import which
import subprocess
import sys
from threading import Thread

from .invsqrt_evidence import REPORT_LIMIT, evidence_directory, evidence_root, regular_file_bytes, read_report_export
from .research_baseline import check_revision, read_baseline, research_control_lock, valid_hash, verified_report_version
from .research_candidates import archived_report, digest
from .research_recovery import acquire_lease, save_report

EXPECTED_SHOTS = 200540928
# Digests from the archived official dataset used by the InvSqrt study.
VERIFIER_HASHES = {
    'verifier.py': 'ddef520dec6b68d1cf0a6f328ddd36d79eb84570b9192cf3f7acaf073f06733a',
    'official-metric.py': 'e7c5bfafa13cb54e138c70a281ca08ecece3e9203b514f6616fa19bf33475c8f',
}
WORKER = Path(__file__).resolve().parents[1] / 'research_candidate_worker.py'


def pinned_code(directory):
    files = {name: regular_file_bytes(directory, name, REPORT_LIMIT) for name in VERIFIER_HASHES}
    if any(digest(raw) != VERIFIER_HASHES[name] for name, raw in files.items()):
        raise ValueError('The saved verifier or metric does not match the supported InvSqrt build.')
    return files


def comparison_baseline(settings, report):
    proposal = report['proposal']
    baseline = archived_report(settings, proposal.get('baseline_parent') or proposal['parent'])
    version = verified_report_version(settings, baseline)
    variant = report['variants'][0]
    if (version['circuit_sha256'] != variant['sha256']
            or version['report_sha256'] != variant['report_sha256']):
        raise ValueError('The archived comparison baseline changed.')
    return baseline


def decide_candidate(settings, identity, data):
    if not isinstance(data, dict) or set(data) != {
        'decision', 'source_sha256', 'expected_project_revision', 'request_id',
    }:
        raise ValueError('Include the decision, source hash, baseline revision, and request ID.')
    action, key = data['decision'], data['request_id']
    if action not in ('verify', 'reject') or not isinstance(key, str) or not 1 <= len(key) <= 128:
        raise ValueError('Use a verification or rejection decision and a stable request ID.')
    if not valid_hash(data['source_sha256']):
        raise ValueError('Review a candidate with a valid source SHA-256.')
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

    with research_control_lock(settings) as root:
        report = archived_report(settings, identity)
        proposal = report.get('proposal') or {}
        if data['source_sha256'] != proposal.get('source_sha256'):
            raise ValueError('Candidate source changed. Review it again.')
        prior = proposal.get('review_decision')
        if prior:
            if prior['request_id'] == key and prior['fingerprint'] == fingerprint:
                return report
            raise ValueError('A review decision is already recorded for this candidate.')
        if report['status'] != 'review':
            raise ValueError('This candidate is no longer awaiting review.')
        state = read_baseline(root)
        check_revision(state, data['expected_project_revision'])
        check_revision(state, proposal['project_revision'])
        with evidence_directory(evidence_root(settings) / report['id']) as directory:
            if action == 'verify':
                baseline = comparison_baseline(settings, report)
                if state['current'] and verified_report_version(settings, baseline) != state['current']:
                    raise ValueError('The candidate refers to a different project baseline.')
                pinned_code(directory)
                read_report_export(settings, baseline, 'submission.zip')
            proposal['review_decision'] = {
                'request_id': key, 'fingerprint': fingerprint, 'action': action,
                'at': datetime.now(timezone.utc).isoformat(),
            }
            proposal['decision'] = 'approved' if action == 'verify' else 'rejected'
            if action == 'reject':
                report['status'] = 'rejected'
                save_report(directory, report)
            else:
                start_verification(settings, directory, report)
        return report


def start_verification(settings, directory, report):
    python = which(settings.experiment_python or settings.local_python or sys.executable)
    if not python:
        raise ValueError('Select a local Python environment with Kickmix installed.')
    lease = acquire_lease(directory)
    try:
        report['status'] = 'running'
        report['execution'] = {'protocol': 'lease-v1', 'started_at': datetime.now(timezone.utc).isoformat()}
        save_report(directory, report)
        log = os.open('worker.log', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                      0o600, dir_fd=directory)
        try:
            process = subprocess.Popen(
                [os.path.abspath(python), '-I', str(WORKER), str(evidence_root(settings)),
                 report['id'], str(directory), str(lease)],
                env={'PATH': os.defpath, 'LANG': 'C.UTF-8'}, stdout=log, stderr=log,
                start_new_session=True, pass_fds=(directory, lease),
            )
        finally:
            os.close(log)
        Thread(target=process.wait, daemon=True).start()
    except OSError as error:
        report['status'] = 'failed'
        report['error'] = 'Could not start the local verifier: ' + str(error)
        save_report(directory, report)
    finally:
        os.close(lease)
