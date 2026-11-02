"""Explicit local acceptance of an existing trusted research package in a fresh venv.
Run this script with the new environment's Python, not the developer interpreter.
"""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import site
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', required=True)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--runtime-code', required=True)
    parser.add_argument('--missing-python')
    parser.add_argument('--expected-source-sha256', required=True)
    parser.add_argument('--build-revision')
    args = parser.parse_args()
    root = Path(args.workspace)
    root.mkdir(parents=True, exist_ok=False)
    if sys.prefix == sys.base_prefix or site.ENABLE_USER_SITE or os.environ.get('PYTHONPATH') or os.environ.get('PYTHONHOME'):
        raise RuntimeError('Use an isolated virtual environment without PYTHONPATH/PYTHONHOME or user site-packages.')
    import flagquantum as fq
    import torch
    module = Path(fq.__file__).resolve()
    if not module.is_relative_to(Path(sys.prefix).resolve()) or not module.is_relative_to(Path(sys.prefix).resolve() / 'lib'):
        raise RuntimeError('SDK must be installed inside this fresh environment, not an editable checkout.')
    sys.path.insert(0, str(Path(args.runtime_code).resolve()))
    from workspace_server.config import WorkspaceSettings
    from workspace_server.experiments import ExperimentImports
    from workspace_server.python_runs import PythonRuns
    from workspace_server.research_packages import ResearchPackages
    from workspace_server.reproduction import Reproductions
    settings = WorkspaceSettings(root, root / 'jobs.sqlite3', compute_transport='local', local_python=sys.executable, experiment_python=sys.executable)
    experiments = ExperimentImports(settings); runs = PythonRuns(settings, None, experiments)
    packages = ResearchPackages(settings, experiments, runs)
    raw = Path(args.package).read_bytes()
    imported = packages.import_package(raw, 'qaoa-research.zip')
    original = imported['research']['root_run']
    if imported['runs'][original]['source_hash'] != args.expected_source_sha256:
        raise RuntimeError('Unexpected archived source; refusing to execute.')
    original_fingerprint = sha256(json.dumps(imported, sort_keys=True).encode()).hexdigest()
    sentinel = root / 'retained-draft.py'; sentinel.write_text('# Retain this independent draft.\n')
    blocked = None
    if args.missing_python:
        from dataclasses import replace
        missing_runs = PythonRuns(replace(settings, local_python=args.missing_python), None, experiments)
        missing_service = Reproductions(settings, packages, missing_runs, experiments)
        blocked = missing_service.check({'package_id': imported['id'], 'run_id': original})
        assert blocked['status'] == 'blocked' and blocked['preparation']['blockers']
        missing_service.start(blocked['id'])
        assert not missing_runs.store.list()
        missing_runs.pool.shutdown(wait=True)
    service = Reproductions(settings, packages, runs, experiments)
    check = service.check({'package_id': imported['id'], 'run_id': original})
    assert check['status'] == 'prepared', check
    assert not runs.store.list(), 'Import and check must not execute archived source'
    manifest = check['preparation']['current']
    assert manifest['virtual_environment'] and not manifest['pythonpath_present'] and not manifest['user_site_enabled']
    assert manifest['sdk_distribution_version'] == manifest['sdk_version'] == fq.__version__
    assert manifest['sdk_wheel_sha256'] and manifest['sdk_code_sha256']
    submitted = service.start(check['id'])
    deadline = time.monotonic() + 110
    while time.monotonic() < deadline:
        result = service.get(submitted['id'])
        if result['status'] not in ('verifying', 'submitting'): break
        time.sleep(.2)
    (root / 'verification.json').write_text(json.dumps(result, indent=2))
    assert result['status'] in ('exact', 'tolerance'), result
    assert len(result['artifacts']) == 3
    service.start(check['id'])
    assert len(runs.store.list()) == 1
    restored = Reproductions(settings, packages, runs, experiments).get(check['id'])
    assert restored['status'] == result['status']
    replay = runs.get(result['run_id'])
    observed = replay['runtime']['environment_manifest']
    assert observed['sdk_code_sha256'] == manifest['sdk_code_sha256']
    assert observed['sdk_distribution_version'] == observed['sdk_version']
    assert sentinel.read_text() == '# Retain this independent draft.\n'
    assert sha256(json.dumps(packages.get(imported['id']), sort_keys=True).encode()).hexdigest() == original_fingerprint
    failed = sum(r['status'] == 'failed' for r in imported['runs'].values())
    report = {'schema': 'flagqai.clean-reproduction-acceptance.v1', 'status': 'passed', 'verification_status': result['status'],
              'package_sha256': sha256(raw).hexdigest(), 'source_sha256': args.expected_source_sha256, 'sdk_build_revision': args.build_revision,
              'sdk_path': str(module), 'python_executable': sys.executable, 'sys_path': sys.path, 'runtime_manifest': manifest,
              'observed_execution_manifest': observed, 'blocked_preparation': blocked, 'preserved_archived_failures': failed,
              'run_count': 1, 'verification_id': result['id'], 'model_calls': 0}
    (root / 'acceptance.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'status': 'passed', 'verdict': result['status'], 'run_count': 1, 'preserved_failures': failed, 'report': str(root / 'acceptance.json')}))
    runs.pool.shutdown(wait=True)


if __name__ == '__main__': main()
