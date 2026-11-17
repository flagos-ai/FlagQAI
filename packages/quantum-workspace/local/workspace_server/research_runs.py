"""Present verified research evidence as project-owned run records."""
from math import isfinite

from .invsqrt_evidence import evidence_ids, read_report
from .research_baseline import project_baseline


def research_run(report, details=False):
    identity = 'invsqrt-' + report['id']
    proposal = report.get('proposal') or {}
    change = report.get('change') or {}
    title = report.get('task', 'Baseline and phase-rotation candidate')
    if proposal:
        title = ('Candidate revision awaiting review' if report['status'] == 'review'
                 else 'Reviewed candidate iteration')
    run = {
        'id': identity,
        'project': {'id': 'study-invsqrt', 'name': 'InvSqrt compilation study'},
        'title': title,
        'status': report['status'],
        'created_at': report['created_at'],
        'summary': change.get('description', 'Official baseline reproduction'),
        'parent': proposal.get('parent'),
    }
    if not details:
        return run
    metrics = [
        ('Validation', 'status', None),
        ('Qubits', 'num_qubits', 0),
        ('Toffoli equivalent', 'toffoli_equivalent', 3),
        ('Rotations', 'rotation_count', 0),
        ('Resource cost · lower is better', 'score', 3),
        ('Verified shots', 'verified_shots', 0),
        ('Worst error / tolerance', 'worst_error_over_tolerance', 6),
    ]
    variants = report.get('variants', [])
    scores = {v['name']: v['report'].get('score') for v in variants}
    baseline, candidate = scores.get('baseline'), scores.get('candidate')
    ratio = None
    if type(baseline) in (int, float) and type(candidate) in (int, float) and candidate > 0:
        ratio = baseline / candidate
        if not isfinite(ratio):
            ratio = None
    exports = report.get('exports', []) if report['status'] == 'completed' else []
    source_hash = next((item['sha256'] for item in exports if item['name'] == 'candidate.kmx'),
                       proposal.get('source_sha256'))
    run.update({
        'comparison': {
            'columns': [v['name'].capitalize() for v in variants],
            'rows': [
                {'label': label, 'digits': digits,
                 'values': [v['report'].get(key) for v in variants]}
                for label, key, digits in metrics
            ] + [{'label': 'Wall time · seconds', 'digits': 1,
                  'values': [v['seconds'] for v in variants]}],
            'cost_ratio': ratio,
        },
        'scope': report.get('scope'),
        'change': report.get('change'),
        'format_preflight': report.get('format_preflight'),
        'error': report.get('error'),
        'evidence': report,
        'proposal': report.get('proposal'),
        'source_sha256': source_hash,
        'exports': [
            {**item, 'label': 'Submission package' if item['name'] == 'submission.zip' else item['name'],
             'url': f"/api/research-runs/{identity}/files/{item['name']}"}
            for item in exports
        ],
    })
    return run


def list_research_runs(settings):
    identities = evidence_ids(settings)
    current = read_report(settings)
    if current:
        identities.add(current['id'])
    records = []
    for identity in identities:
        report = read_report(settings, identity)
        if report:
            records.append(research_run(report))
    return sorted(records, key=lambda item: (item['created_at'], item['id']), reverse=True)


def read_research_run(settings, identity):
    if not identity.startswith('invsqrt-'):
        return None
    report = read_report(settings, identity.removeprefix('invsqrt-'))
    if not report:
        return None
    run = research_run(report, details=True)
    baseline = project_baseline(settings)
    run['project']['baseline'] = baseline
    current = baseline['current']
    run['is_project_baseline'] = bool(
        current and current['run_id'] == identity
        and report['status'] == 'completed'
        and current['source_sha256'] == run['source_sha256']
        and any(v['name'] == 'candidate' and v['sha256'] == current['circuit_sha256']
                and v['report_sha256'] == current['report_sha256'] for v in report['variants'])
    )
    return run
