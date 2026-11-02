"""Export an existing QAOA delivery, independently restore and explicitly reverify."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime-code', required=True)
    parser.add_argument('--source-data', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--expected-source-sha256', required=True)
    args = parser.parse_args()
    if os.environ.get('PYTHONPATH') or sys.prefix == sys.base_prefix: raise RuntimeError('Use an installed SDK in an isolated venv without PYTHONPATH.')
    sys.path.insert(0, str(Path(args.runtime_code).resolve()))
    from workspace_server.config import WorkspaceSettings
    from workspace_server.experiments import ExperimentImports
    from workspace_server.python_runs import PythonRuns
    from workspace_server.research_packages import ResearchPackages, read_package
    from workspace_server.reproduction import Reproductions
    output = Path(args.output); output.mkdir(parents=True, exist_ok=False)
    def services(root):
        settings = WorkspaceSettings(root, root / 'jobs.sqlite3', compute_transport='local', local_python=sys.executable, experiment_python=sys.executable)
        imports = ExperimentImports(settings); runs = PythonRuns(settings, None, imports)
        packages = ResearchPackages(settings, imports, runs)
        repro = Reproductions(settings, packages, runs, imports)
        return packages, repro, runs
    source, source_checks, source_runs = services(Path(args.source_data))
    source_record = source.get(source.records()[0]['id'])
    if source_record['research']['root_source_sha256'] != args.expected_source_sha256: raise RuntimeError('Unexpected source identity; refusing to execute.')
    raw = source.export({'package_id': source_record['id'], 'adopted': source_record['research']['adopted']})
    (output / 'qaoa-delivery.zip').write_bytes(raw)
    dest, checks, runs = services(output / 'independent')
    draft = output / 'independent' / 'retained-draft.py'; draft.write_text('# Retain this independent draft.\n')
    imported = dest.import_package(raw, 'qaoa-delivery.zip')
    original = imported['research']['root_run']; archived = imported['archived_verifications']
    assert archived and any(r['validated_status'] in ('exact', 'tolerance') for r in archived)
    assert all(r['evidence_scope'] == 'archived' for r in archived)
    assert checks.list({'package_id': imported['id'], 'run_id': original}) == []
    assert runs.store.list() == []
    assert all(not runs.get(r['report'].get('run_id')) for r in archived if r['report'].get('run_id'))
    assert sum(r['status'] == 'failed' for r in imported['runs'].values()) == 2
    checked = checks.check({'package_id': imported['id'], 'run_id': original})
    assert not runs.store.list()
    checks.start(checked['id'])
    end = time.monotonic() + 110
    while time.monotonic() < end:
        result = checks.get(checked['id'])
        if result['status'] not in ('verifying', 'submitting'): break
        time.sleep(.2)
    assert result['status'] in ('exact', 'tolerance'), result
    checks.start(checked['id']); assert len(runs.store.list()) == 1
    for item in archived: assert checks.store.get(item['report']['id']) is None
    second = dest.export({'package_id': imported['id'], 'adopted': imported['research']['adopted']})
    (output / 'qaoa-delivery-reverified.zip').write_bytes(second)
    third, third_checks, third_runs = services(output / 'second-independent')
    restored = third.import_package(second, 'qaoa-delivery-reverified.zip')
    assert len(restored['archived_verifications']) == len(archived) + 1
    assert third_checks.list({'package_id': restored['id'], 'run_id': original}) == []
    assert not third_runs.store.list()
    assert {r['key'] for r in archived}.issubset({r['key'] for r in restored['archived_verifications']})
    assert draft.read_text() == '# Retain this independent draft.\n'
    report = {'schema': 'flagqai.research-delivery-acceptance.v1', 'status': 'passed', 'package_sha256': sha256(raw).hexdigest(), 'archived_verifications': len(archived),
              'current_verdict': result['status'], 'current_run': result['run_id'], 'source_sha256': result['source_hash'], 'reexported_verifications': len(restored['archived_verifications']),
              'preserved_original_failures': 2, 'import_submitted_runs': 0, 'explicit_reproduction_runs': 1, 'model_calls': 0}
    (output / 'acceptance.json').write_text(json.dumps(report, indent=2))
    (output / 'current-verification.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(report))
    for service in (source_runs, runs, third_runs): service.pool.shutdown(wait=True)


if __name__ == '__main__': main()
