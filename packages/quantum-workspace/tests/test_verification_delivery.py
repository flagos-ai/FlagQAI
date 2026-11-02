import copy
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch
import zipfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.config import WorkspaceSettings
from workspace_server.experiments import ExperimentImports
from workspace_server.research_packages import ResearchPackages, make_package, read_package, LEGACY_SCHEMA
from workspace_server.reproduction import Reproductions
from test_research_packages import fixture


def evidence():
    research, runs, files = fixture(); original = runs['original-run']
    replay = copy.deepcopy(original); replay.update(id='independent-replay', name='Reproduction', logs=[{'stream': 'stdout', 'text': 'Original reproduction output'}])
    for i, ref in enumerate(replay['experiments']):
        ref['id'] = 'fqx-' + str(i + 3) * 32
        files[ref['id']] = ('sdk' + str(i)).encode()
    report = {'id': 'verify-' + 'a' * 32, 'status': 'exact', 'created_at': 1, 'package_id': 'previous-machine-scope', 'original_run': original['id'], 'source_hash': original['source_hash'],
              'original_archives': original['experiments'], 'run_id': replay['id'], 'runtime': {'python': '3.12', 'sdk_version': '0.4', 'pytorch': '2.13'},
              'configured_environment': {'transport': 'local', 'python': 'previous-machine-python'}, 'producer_versions': ['0.4'], 'differences': ['Original environment difference'], 'notice': 'Original snapshot'}
    report['artifacts'] = [{'filename': a['filename'], 'status': 'exact', 'circuit': 'exact', 'measurements': 'exact', 'counts': 'exact', 'original_archive': a, 'reproduced_archive': b, 'original_metrics': None, 'reproduced_metrics': None} for a, b in zip(original['experiments'], replay['experiments'])]
    return research, runs, files, [report], {replay['id']: replay}


def project(service, data, filename, **kwargs):
    identity = 'fqx-' + uuid.uuid4().hex
    record = {'id': identity, 'status': 'imported', 'program': {'id': identity, 'source': 'qasm', 'compiled': {'qubits': 1, 'instructions': [{'name': 'X' if data == b'changed' else 'H', 'wires': [0], 'params': {}}], 'measurement_qubits': [0]},
        'experiment': {'id': identity, 'filename': filename, 'has_result': True, 'sha256': sha256(data).hexdigest(), 'measurements': [{'kind': 'counts', 'shots': 1, 'qubits': [0], 'metadata': {'seed': 42}, 'batches': [[{'key_type': 'string', 'state': '0', 'count': 1}]]}]}}}
    (service.root / (identity + '.fqx')).write_bytes(data); service.store.put(record)
    return record


class VerificationDeliveryTest(unittest.TestCase):
    def test_legacy_package_still_loads_and_invalid_receipt_links_are_rejected(self):
        raw = make_package(*fixture()); buffer = BytesIO()
        with zipfile.ZipFile(BytesIO(raw)) as old, zipfile.ZipFile(buffer, 'w') as new:
            for name in old.namelist():
                data = old.read(name)
                if name == 'manifest.json':
                    index = json.loads(data); index['schema'] = LEGACY_SCHEMA; data = json.dumps(index).encode()
                new.writestr(name, data)
        self.assertEqual(read_package(buffer.getvalue())[0]['root_run'], 'original-run')
        for mutation in ('active', 'source', 'missing', 'self', 'artifact'):
            research, runs, files, reports, replays = evidence()
            if mutation == 'active': reports[0]['status'] = 'verifying'
            if mutation == 'source': reports[0]['source_hash'] = 'f' * 64
            if mutation == 'missing': replays.clear()
            if mutation == 'artifact': reports[0]['artifacts'][0]['reproduced_archive'] = {'id': 'wrong', 'sha256': 'f' * 64}
            if mutation == 'self': reports[0]['run_id'] = 'original-run'; replays = {'original-run': runs['original-run']}
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): make_package(research, runs, files, reports, replays)

    def test_archived_history_never_becomes_a_local_run_or_receipt_and_reexport_is_stable(self):
        with tempfile.TemporaryDirectory() as folder:
            settings = WorkspaceSettings(Path(folder), Path(folder) / 'jobs.sqlite3'); imports = ExperimentImports(settings)
            packages = ResearchPackages(settings, imports, None)
            raw = make_package(*evidence())
            with patch.object(ExperimentImports, 'import_file', project): record = packages.import_package(raw, 'delivery.zip')
            archived = record['archived_verifications'][0]
            self.assertEqual(archived['validated_status'], 'exact'); self.assertEqual(archived['comparison']['status'], 'exact')
            self.assertEqual(archived['run']['logs'][0]['text'], 'Original reproduction output')
            self.assertEqual(len(record['runs']), 1)
            service = Reproductions(settings, packages, None, imports)
            self.assertEqual(service.list({'package_id': record['id'], 'run_id': 'original-run'}), [])
            self.assertIsNone(service.store.get(archived['report']['id']))
            second = packages.export({'package_id': record['id']})
            self.assertEqual(read_package(second)[0]['adopted']['reason'], record['research']['adopted']['reason'])
            with patch.object(ExperimentImports, 'import_file', project): restored = packages.import_package(second, 'again.zip')
            self.assertEqual(restored['archived_verifications'][0]['key'], archived['key'])
            self.assertEqual(restored['archived_verifications'][0]['report']['package_id'], 'previous-machine-scope')

    def test_false_positive_verdict_rejected_before_any_import_commit(self):
        with tempfile.TemporaryDirectory() as folder:
            settings = WorkspaceSettings(Path(folder), Path(folder) / 'jobs.sqlite3'); imports = ExperimentImports(settings); packages = ResearchPackages(settings, imports, None)
            research, runs, files, reports, replays = evidence()
            ref = replays['independent-replay']['experiments'][0]
            files[ref['id']] = b'changed'; ref['sha256'] = sha256(b'changed').hexdigest()
            raw = make_package(research, runs, files, reports, replays)
            with patch.object(ExperimentImports, 'import_file', project), self.assertRaisesRegex(ValueError, 'verdict'):
                packages.import_package(raw, 'false-pass.zip')
            self.assertEqual(packages.records(), []); self.assertEqual(imports.records(), [])

    def test_failed_reproduction_logs_and_reason_survive_as_failed_evidence(self):
        research, runs, files, reports, replays = evidence()
        reports[0]['status'] = 'failed'; reports[0]['error'] = 'Python failed before saving'
        replay = replays['independent-replay']; replay.update(status='failed', execution_status='failed', collection_status='failed', experiments=[], error='Python failed before saving')
        with tempfile.TemporaryDirectory() as folder:
            settings = WorkspaceSettings(Path(folder), Path(folder) / 'jobs.sqlite3'); imports = ExperimentImports(settings); packages = ResearchPackages(settings, imports, None)
            with patch.object(ExperimentImports, 'import_file', project): record = packages.import_package(make_package(research, runs, files, reports, replays), 'failed-history.zip')
            archived = record['archived_verifications'][0]
            self.assertEqual(archived['validated_status'], 'failed'); self.assertIsNone(archived['comparison'])
            self.assertEqual(archived['report']['error'], 'Python failed before saving'); self.assertEqual(archived['run']['status'], 'failed')

if __name__ == '__main__': unittest.main()
