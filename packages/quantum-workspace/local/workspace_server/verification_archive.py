"""Portable verification snapshots. Imported history never becomes a local receipt."""
from hashlib import sha256
import json
import math
import re

TERMINAL = {'exact', 'tolerance', 'different', 'incomplete', 'failed', 'blocked', 'prepared', 'submission_unknown'}
CHECKED = {'exact', 'tolerance', 'different'}


def encode(value):
    try: return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
    except RecursionError as error: raise ValueError('Verification metadata is nested too deeply.') from error


def decode(raw):
    try: return json.loads(raw)
    except (RecursionError, UnicodeError, json.JSONDecodeError) as error: raise ValueError('Invalid verification JSON.') from error


def envelope(report):
    value = {'schema': 'flagqai.archived-verification.v1', 'report': report}
    return sha256(encode(value)).hexdigest(), value


def history_entries(reports, replay_runs):
    if len(reports) > 128 or len(replay_runs) > 64: raise ValueError('Verification history exceeds 128 reports or 64 reproduction runs; nothing was omitted.')
    entries = {}
    for report in reports:
        key, value = envelope(report)
        entries['verifications/' + key + '.json'] = encode(value)
    for identity, run in replay_runs.items():
        entries['verification-runs/' + identity + '.json'] = encode(run)
        entries['verification-sources/' + identity + '.py'] = run['source'].encode()
    return entries


def validate_history(entries, core_runs):
    from .research_packages import validate_run
    replay_runs = {}
    reports = []
    for path, raw in entries.items():
        if path.startswith('verification-runs/'):
            run = validate_run(decode(raw))
            if path != 'verification-runs/' + run['id'] + '.json' or entries.get('verification-sources/' + run['id'] + '.py') != run['source'].encode(): raise ValueError('Verification run source identity mismatch.')
            if run['id'] in core_runs and core_runs[run['id']] != run: raise ValueError('Verification run identity conflicts with research history.')
            replay_runs[run['id']] = run
    if len(replay_runs) > 64: raise ValueError('Too many verification runs.')
    required = set()
    for path, raw in entries.items():
        if not path.startswith('verifications/'): continue
        value = decode(raw)
        if not isinstance(value, dict) or value.get('schema') != 'flagqai.archived-verification.v1' or not isinstance(value.get('report'), dict): raise ValueError('Unsupported archived verification schema.')
        report = value['report']; key, expected = envelope(report)
        if path != 'verifications/' + key + '.json' or value != expected: raise ValueError('Verification snapshot digest mismatch.')
        if not re.fullmatch(r'verify-[a-f0-9]{32}', str(report.get('id'))) or report.get('status') not in TERMINAL:
            raise ValueError('Wait for active verifications to settle before export.')
        original = core_runs.get(report.get('original_run'))
        if original and (original['status'] != 'completed' or original.get('collection_status') != 'completed' or original.get('collection_errors')): raise ValueError('Verification refers to an incomplete original version.')
        if not original or original['source_hash'] != report.get('source_hash') or original.get('experiments', []) != report.get('original_archives'):
            raise ValueError('Verification does not match the original version and archives.')
        if type(report.get('created_at')) not in (int, float) or not math.isfinite(report['created_at']) or not 0 <= report['created_at'] <= 8640000000000: raise ValueError('Invalid verification timestamp.')
        for field in ('runtime', 'configured_environment'):
            if not isinstance(report.get(field), dict): raise ValueError('Missing verification environment.')
        if not isinstance(report.get('notice'), str) or not isinstance(report.get('producer_versions'), list) or any(not isinstance(v, str) for v in report['producer_versions']): raise ValueError('Invalid verification metadata.')
        if not isinstance(report.get('differences'), list) or any(not isinstance(v, str) for v in report['differences']): raise ValueError('Invalid verification differences.')
        # Renderable core facts are strictly typed; richer archived preparation stays download-only.
        for field in ('python', 'sdk_version', 'pytorch'):
            if report['runtime'].get(field) is not None and not isinstance(report['runtime'][field], str): raise ValueError('Invalid runtime version field.')
        for field in ('transport', 'python'):
            if not isinstance(report['configured_environment'].get(field), str): raise ValueError('Invalid configured environment field.')
        if report.get('error') is not None and not isinstance(report['error'], str): raise ValueError('Invalid archived error.')
        new = replay_runs.get(report.get('run_id'))
        if new:
            if new['id'] == original['id']: raise ValueError('A verification must reference an independent reproduction run.')
            if new['source_hash'] != original['source_hash'] or new['source'] != original['source']: raise ValueError('Verification replay source does not match the original.')
            required.update(('verification-runs/' + new['id'] + '.json', 'verification-sources/' + new['id'] + '.py'))
        if report['status'] in CHECKED and (not new or new['status'] != 'completed' or new.get('collection_status') != 'completed' or new.get('collection_errors')):
            raise ValueError('A conclusive verification needs its completed reproduction evidence.')
        if report['status'] in CHECKED:
            rows = report.get('artifacts')
            if not isinstance(rows, list) or len(rows) != len(original['experiments']) or any(not isinstance(r, dict) or not isinstance(r.get('filename'), str) for r in rows): raise ValueError('Missing verification artifact comparisons.')
            by_name = {r['filename']: r for r in rows}
            if len(by_name) != len(rows): raise ValueError('Duplicate verification artifact comparisons.')
            new_refs = {r['filename']: r for r in new['experiments']}
            for ref in original['experiments']:
                row = by_name.get(ref['filename'])
                if not row: raise ValueError('Verification artifact comparison is unavailable.')
                for field, target in [('original_archive', ref), ('reproduced_archive', new_refs.get(ref['filename']))]:
                    if not target or not isinstance(row.get(field), dict) or any(row[field].get(k) != target[k] for k in ('id', 'sha256')): raise ValueError('Verification comparison artifact identity mismatch.')
        if len(raw) > 1024 * 1024: raise ValueError('Verification report exceeds 1 MiB.')
        reports.append({'key': key, 'report': report, 'run': new})
        required.add(path)
    if len(reports) > 128: raise ValueError('Too many verification reports.')
    all_history = {path for path in entries if path.startswith(('verifications/', 'verification-runs/', 'verification-sources/'))}
    if required != all_history: raise ValueError('Verification history contains unreferenced files.')
    return reports, replay_runs


def project_history(reports, core_runs, records):
    from .reproduction import compare_runs, equal
    result = []
    for snapshot in reports:
        report, new = snapshot['report'], snapshot['run']
        comparison = None
        if report['status'] in CHECKED:
            comparison = compare_runs(core_runs[report['original_run']], new, records, records)
            if comparison['status'] != report['status']:
                raise ValueError('Archived verification verdict does not match bundled scientific evidence.')
            reported = {r['filename']: r for r in report['artifacts']}
            for row in comparison['artifacts']:
                old = reported[row['filename']]
                if any(old.get(k) != row[k] for k in ('status', 'circuit', 'counts', 'measurements')) or any(not equal(old.get(k), row[k], True) for k in ('original_metrics', 'reproduced_metrics')):
                    raise ValueError('Archived verification comparison does not match bundled evidence.')
        result.append({**snapshot, 'validated_status': report['status'], 'comparison': comparison,
                       'evidence_scope': 'archived', 'notice': 'Imported archived evidence, not a verification in this environment. Hashes and bundled conclusive results were checked; authorship is not authenticated.'})
    return sorted(result, key=lambda r: (r['report']['created_at'], r['key']), reverse=True)
