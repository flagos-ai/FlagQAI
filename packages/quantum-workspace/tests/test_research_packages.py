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
from workspace_server.research_packages import make_package, read_package, ResearchPackages


def fixture():
    source = 'print("archived source must never execute")\n'
    refs = [{'id': 'fqx-' + str(i) * 32, 'filename': name, 'sha256': sha256(('sdk' + str(i)).encode()).hexdigest(), 'has_result': True}
            for i, name in enumerate(('01-maxcut-baseline.fqx', '02-maxcut-qaoa.fqx', '03-maxcut-replay.fqx'))]
    run = {'id': 'original-run', 'source': source, 'source_hash': sha256(source.encode()).hexdigest(), 'status': 'completed', 'execution_status': 'completed', 'collection_status': 'completed', 'logs': [], 'experiments': refs}
    research = {'schema': 'flagqai.research-record.v1', 'root_run': run['id'], 'root_source_sha256': run['source_hash'], 'goal': 'Compare QAOA versions', 'turns': [{'goal': 'Original request', 'runs': [run['id']]}], 'notices': [], 'runs': [{'id': run['id']}], 'adopted': {'run': run['id'], 'source': run['source_hash'], 'archive': refs[1]['id'], 'sha256': refs[1]['sha256'], 'reason': 'Chosen result'}}
    files = {ref['id']: ('sdk' + str(i)).encode() for i, ref in enumerate(refs)}
    return research, {run['id']: run}, files


def rewrite(raw, mutate):
    with zipfile.ZipFile(BytesIO(raw)) as z:
        files = {name: z.read(name) for name in z.namelist()}
    mutate(files)
    output = BytesIO()
    with zipfile.ZipFile(output, 'w') as z:
        for name, data in files.items(): z.writestr(name, data)
    return output.getvalue()


class ResearchPackageTest(unittest.TestCase):
    def test_round_trip_preserves_source_identity_artifacts_goal_and_adoption(self):
        research, runs, files = fixture()
        metadata, restored, entries = read_package(make_package(research, runs, files))
        self.assertEqual(restored, runs)
        self.assertEqual(metadata['adopted'], research['adopted'])
        self.assertEqual(entries['sources/original-run.py'], runs['original-run']['source'].encode())
        for identity, data in files.items(): self.assertEqual(entries['artifacts/' + identity + '.fqx'], data)

    def test_invalid_schema_hash_missing_and_unsafe_files_are_refused(self):
        research, runs, files = fixture(); raw = make_package(research, runs, files)
        cases = [lambda f: f.update({'../outside.py': b'bad'}), lambda f: f.update({'sources/original-run.py': b'changed'}),
                 lambda f: f.pop(next(n for n in f if n.startswith('artifacts/'))), lambda f: f.update({'manifest.json': b'{"schema":"future"}'})]
        for mutate in cases:
            with self.subTest(mutate=mutate), self.assertRaises(ValueError): read_package(rewrite(raw, mutate))
        with self.assertRaises(ValueError): read_package(b'not a zip')
        with self.assertRaises(ValueError): make_package(research, runs, {**files, next(iter(files)): b'corrupt'})

    def test_duplicate_zip_paths_and_symbolic_links_are_refused(self):
        raw = make_package(*fixture())
        buffer = BytesIO(raw)
        with zipfile.ZipFile(buffer, 'a') as z: z.writestr('research.json', b'{}')
        with self.assertRaises(ValueError): read_package(buffer.getvalue())
        output = BytesIO()
        with zipfile.ZipFile(output, 'w') as z:
            info = zipfile.ZipInfo('research.json'); info.create_system = 3; info.external_attr = 0o120777 << 16
            z.writestr(info, b'/outside')
        with self.assertRaises(ValueError): read_package(output.getvalue())

    def test_pending_runs_source_mismatch_and_bad_adoption_are_refused(self):
        for mutate in (lambda r, s: s['original-run'].update(status='running'), lambda r, s: s['original-run'].update(source='edited'), lambda r, s: r['adopted'].update(sha256='f' * 64)):
            research, runs, files = fixture(); mutate(research, runs)
            with self.assertRaises(ValueError): make_package(research, runs, files)

    def test_import_is_independent_and_sdk_failure_never_commits_partial_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); settings = WorkspaceSettings(root, root / 'jobs.sqlite3')
            experiments = ExperimentImports(settings)
            packages = ResearchPackages(settings, experiments, None)
            def project(service, data, filename, **kwargs):
                if data == b'sdk2' and project.reject: raise ValueError('SDK refused artifact')
                identity = 'fqx-' + uuid.uuid4().hex
                record = {'id': identity, 'status': 'imported', 'program': {'id': identity, 'source': 'qasm', 'compiled': {}, 'experiment': {'id': identity, 'filename': filename, 'sha256': sha256(data).hexdigest()}}}
                (service.root / (identity + '.fqx')).write_bytes(data); service.store.put(record)
                return record
            project.reject = True
            raw = make_package(*fixture())
            with patch.object(ExperimentImports, 'import_file', project), self.assertRaises(ValueError): packages.import_package(raw, 'input.zip')
            self.assertEqual(experiments.records(), [])
            self.assertEqual(packages.records(), [])
            project.reject = False
            with patch.object(ExperimentImports, 'import_file', project):
                first = packages.import_package(raw, 'first.zip'); second = packages.import_package(raw, 'first.zip')
            self.assertNotEqual(first['id'], second['id'])
            self.assertNotEqual(first['local_ids'], second['local_ids'])
            self.assertEqual(first['research']['adopted']['run'], 'original-run')
            reexported = packages.export({'package_id': first['id'], 'adopted': first['research']['adopted']})
            self.assertEqual(read_package(reexported)[0]['root_run'], 'original-run')
            for record in experiments.records(): self.assertNotIn('origin', record['program'])
            self.assertEqual(len(experiments.records()), 6)
            prior = {item['id'] for item in experiments.records()}
            original_put = experiments.store.put
            count = [0]
            def failing_put(record):
                count[0] += 1
                if count[0] == 2: raise OSError('simulated commit failure')
                return original_put(record)
            with patch.object(ExperimentImports, 'import_file', project), patch.object(experiments.store, 'put', failing_put), self.assertRaises(OSError):
                packages.import_package(raw, 'failed.zip')
            self.assertEqual({item['id'] for item in experiments.records()}, prior)
            self.assertEqual(len(packages.records()), 2)


if __name__ == '__main__': unittest.main()
