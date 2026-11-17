"""Present verified research evidence as project-owned run records."""
from math import isfinite

from .invsqrt_evidence import evidence_ids, read_report


def research_run(report, details=False):
    identity = 'invsqrt-' + report['id']
    proposal = report.get('proposal') or {}
    change = report.get('change') or {}
    run = {
        'id': identity,
        'project': {'id': 'study-invsqrt', 'name': 'InvSqrt compilation study'},
        'title': ('Reviewed candidate iteration' if proposal else
                  report.get('task', 'Baseline and phase-rotation candidate')),
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
    return research_run(report, details=True) if report else None
