"""Summarize actual corpus receipts; preserve original failures and verify source identity."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.job_store import SQLiteJobStore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report_root', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    root = args.report_root.resolve()
    ledger = json.loads((root / 'ledger.json').read_text())
    web = Path(__file__).resolve().parents[3] / 'apps/web/public/notebooks'
    catalog = json.loads((web / 'catalog.json').read_text())
    entries = []
    for item in catalog['entries']:
        raw = (web / (item['id'] + '.ipynb')).read_bytes()
        assert sha256(raw).hexdigest() == item['notebookSha256']
        original = json.loads(raw)
        sources = [''.join(c['source']) for c in original['cells'] if c['cell_type'] == 'code']
        attempts = []
        for record in ledger['attempts']:
            if record['notebook_id'] != item['id']:
                continue
            directory = root / record['directory']
            transcript = directory / 'run.json'
            if not transcript.exists():
                store = SQLiteJobStore(directory / 'jobs.notebook-runs.sqlite3')
                runs = store.list(limit=None)
                if not runs:
                    attempts.append({'attempt': record['attempt'], 'status': record['status'], 'audit_error': record.get('error')})
                    continue
                assert len(runs) == 1
                transcript = directory / 'retained-run.json'
                transcript.write_text(json.dumps(runs[0], indent=2) + '\n')
            observed = json.loads(transcript.read_text())
            assert [cell['source'] for cell in observed['cells']] == sources
            for artifact in record.get('artifacts', []):
                path = directory / artifact['path']
                assert path.resolve().is_relative_to(directory.resolve())
                raw_artifact = path.read_bytes()
                assert len(raw_artifact) == artifact['bytes']
                assert sha256(raw_artifact).hexdigest() == artifact['sha256']
            complete = observed['status'] == 'completed' and all(cell['status'] == 'completed' for cell in observed['cells'])
            attempts.append({'attempt': record['attempt'], 'status': 'completed' if complete else ('incomplete' if observed['status'] == 'completed' else observed['status']),
                'started_at': record.get('started_at'),
                'elapsed_seconds': record.get('elapsed_seconds'), 'code_cells': len(sources),
                'completed_cells': sum(c['status'] == 'completed' for c in observed['cells']),
                'source_cells_unchanged': True, 'runtime': observed.get('runtime'),
                'truncated_output_cells': [i + 1 for i, c in enumerate(observed['cells'])
                    if any('Output truncated (1 MiB or 2000 events)' in o.get('text', '') for o in c['outputs'])],
                'support_sources_sha256': {str(path.relative_to(directory)): sha256(path.read_bytes()).hexdigest()
                    for path in sorted((directory / 'notebook-workspaces').rglob('*.py')) if path.is_file() and not path.is_symlink()},
                'error': observed.get('error'), 'audit_error': record.get('error'),
                'cell_errors': [{'code_cell': i + 1, 'status': c['status'], 'errors': [
                    {key: o.get(key) for key in ('ename', 'evalue')} for o in c['outputs'] if o['output_type'] == 'error']}
                    for i, c in enumerate(observed['cells']) if c['status'] != 'completed'],
                'transcript': str(transcript.relative_to(root)), 'transcript_sha256': sha256(transcript.read_bytes()).hexdigest(),
                'executed_notebook': record['directory'] + '/executed.ipynb' if (directory / 'executed.ipynb').exists() else None,
                'artifacts': record.get('artifacts', [])})
        entries.append({'id': item['id'], 'path': item['path'], 'source_sha256': item['notebookSha256'],
                        'status': attempts[-1]['status'] if attempts else 'not_run', 'attempts': attempts})
    summary = {'schema': 'flagqai.notebook-corpus-summary.v1', 'catalog_revision': catalog['revision'],
        'source_tree_revision': json.loads((web.parent / 'examples/synthesis-files.json').read_text())['revision'],
        'notebooks': len(entries), 'completed': sum(e['status'] == 'completed' for e in entries),
        'completed_code_cells': sum(e['attempts'][-1].get('completed_cells', 0) for e in entries if e['attempts']),
        'source_cells_modified': False, 'model_calls': 0,
        'max_independent_kernels': ledger.get('max_independent_kernels', 1),
        'scope': 'Fresh original-cell execution through isolated real Web kernels; concurrency is recorded separately. Execution success does not establish optimizer convergence or scientific correctness beyond the assertions actually executed.',
        'entries': entries}
    for name, key in [('runtime-environment.json', 'runtime_environment'), ('external-inputs.json', 'external_inputs'), ('sdk-build.json', 'sdk_build')]:
        if (root / name).exists():
            summary[key] = json.loads((root / name).read_text())
    output = args.output or root / 'summary.json'
    serialized = json.dumps(summary, indent=2)
    serialized = serialized.replace(str(root), '<audit-root>').replace(str(Path(__file__).resolve().parents[3]), '<workspace>')
    output.write_text(serialized + '\n')
    print(json.dumps({'notebooks': summary['notebooks'], 'completed': summary['completed'], 'report': str(output)}))


if __name__ == '__main__':
    main()
