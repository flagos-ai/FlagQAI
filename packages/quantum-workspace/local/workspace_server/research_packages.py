"""Portable research evidence. ZIP/SDK reads never execute bundled Python."""
import copy
from dataclasses import replace
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path
import re
import stat
import tempfile
import time
import uuid
import zipfile
import zlib

from .experiments import ExperimentImports, MAX_UPLOAD_BYTES
from .job_store import SQLiteJobStore
from .research_results import attach_result
from .verification_archive import history_entries, validate_history, project_history

MAX_PACKAGE = 64 * 1024 * 1024
SCHEMA = 'flagqai.research-package.v2'
LEGACY_SCHEMA = 'flagqai.research-package.v1'
ID = re.compile(r'[a-zA-Z0-9-]{1,128}')
HASH = re.compile(r'[a-f0-9]{64}')


def encoded(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')


def adoption(value, runs):
    if value is None:
        return None
    if not isinstance(value, dict) or not isinstance(value.get('reason'), str) or len(value['reason']) > 1000:
        raise ValueError('Invalid adopted-version note.')
    run = runs.get(value.get('run'))
    ref = next((ref for ref in (run or {}).get('experiments', []) if ref['id'] == value.get('archive')), None)
    if not run or run.get('status') != 'completed' or run.get('collection_status') != 'completed' or run.get('collection_errors') or value.get('source') != run['source_hash'] or not ref or value.get('sha256') != ref['sha256']:
        raise ValueError('Adopted-version identity does not match the package.')
    return {key: value[key] for key in ('run', 'source', 'archive', 'sha256', 'reason')}


def research_metadata(data, runs):
    if not isinstance(data, dict) or data.get('schema') != 'flagqai.research-record.v1':
        raise ValueError('Unsupported research-record version.')
    root = data.get('root_run')
    if root not in runs or runs[root]['source_hash'] != data.get('root_source_sha256'):
        raise ValueError('Research baseline identity does not match.')
    if not isinstance(data.get('goal'), str) or len(data['goal']) > 32000:
        raise ValueError('Invalid original research objective.')
    turns = data.get('turns', [])
    if not isinstance(turns, list) or len(turns) > 128:
        raise ValueError('Too many research requests.')
    for turn in turns:
        if not isinstance(turn, dict) or not isinstance(turn.get('goal'), str) or len(turn['goal']) > 32000:
            raise ValueError('Invalid research request.')
        for key in ('runs', 'candidates'):
            if not isinstance(turn.get(key, []), list) or any(identity not in runs for identity in turn.get(key, [])):
                raise ValueError('Research request refers to an unavailable run.')
    notices = data.get('notices', [])
    if not isinstance(notices, list) or len(notices) > 128 or any(not isinstance(n, str) or len(n) > 4000 for n in notices):
        raise ValueError('Invalid research notices.')
    return {'schema': data['schema'], 'root_run': root, 'root_source_sha256': data['root_source_sha256'],
            'goal': data['goal'], 'turns': turns, 'notices': notices, 'adopted': adoption(data.get('adopted'), runs)}


def validate_run(run):
    if not isinstance(run, dict) or not isinstance(run.get('id'), str) or not ID.fullmatch(run['id']):
        raise ValueError('Invalid archived run identity.')
    source = run.get('source')
    if not isinstance(source, str) or not 0 < len(source.encode()) <= 32768 or sha256(source.encode()).hexdigest() != run.get('source_hash'):
        raise ValueError('Run source does not match its SHA-256.')
    if run.get('status') not in ('completed', 'failed', 'cancelled', 'timed_out'):
        raise ValueError('Wait for running tasks to settle before exporting.')
    if run.get('collection_status') in ('pending', 'collecting'):
        raise ValueError('Wait for artifact collection to settle before exporting.')
    summaries = run.get('research_results', {})
    if not isinstance(summaries, dict) or len(summaries) > 32:
        raise ValueError('Invalid saved research results.')
    refs_by_id = {r.get('id'): r for r in run.get('experiments', []) if isinstance(r, dict)}
    for identity, result in summaries.items():
        ref = refs_by_id.get(identity)
        if not ref or not isinstance(result, dict) or result.get('schema') != 'flagqai.research-result.v1':
            raise ValueError('Research result refers to an unavailable experiment.')
        binding = result.get('binding', {})
        from .research_results import digest
        if (not isinstance(binding, dict) or binding.get('run_id') != run['id']
                or binding.get('source_sha256') != run['source_hash'] or binding.get('archive_sha256') != ref.get('sha256')
                or digest({k: v for k, v in result.items() if k != 'sha256'}) != result.get('sha256')):
            raise ValueError('Research result does not match its code or artifact version.')
    if not isinstance(run.get('name', ''), str) or not isinstance(run.get('environment', {}), dict) or not isinstance(run.get('runtime', {}), dict):
        raise ValueError('Invalid archived runtime metadata.')
    if run.get('elapsed_seconds') is not None and (type(run['elapsed_seconds']) not in (int, float) or not math.isfinite(run['elapsed_seconds']) or run['elapsed_seconds'] < 0):
        raise ValueError('Invalid archived compute duration.')
    if run.get('project'):
        raise ValueError('This package version supports single-file research. Project dependencies must be exported separately.')
    refs = run.get('experiments', [])
    if not isinstance(refs, list) or len(refs) > 32:
        raise ValueError('Too many artifacts in one run.')
    for ref in refs:
        if not isinstance(ref, dict) or not re.fullmatch(r'fqx-[a-f0-9]{32}', str(ref.get('id'))) or not HASH.fullmatch(str(ref.get('sha256'))) or not isinstance(ref.get('filename'), str) or len(ref['filename']) > 300 or not ref['filename'].endswith('.fqx'):
            raise ValueError('Invalid artifact reference.')
    if not isinstance(run.get('logs', []), list) or any(not isinstance(log, dict) or not isinstance(log.get('text'), str) for log in run.get('logs', [])) or len(encoded(run)) > 1024 * 1024:
        raise ValueError('Archived run metadata is too large.')
    return run


def make_package(research, runs, files, reports=None, verification_runs=None):
    if not 1 <= len(runs) <= 64:
        raise ValueError('A package supports 1–64 recorded runs.')
    for identity, run in runs.items():
        validate_run(run)
        if identity != run['id']:
            raise ValueError('Run identity mismatch.')
    metadata = research_metadata(research, runs)
    verification_runs = verification_runs or {}
    entries = {'research.json': encoded(metadata), **history_entries(reports or [], verification_runs)}
    validate_history(entries, runs)
    if len(entries['research.json']) > 8 * 1024 * 1024:
        raise ValueError('Research metadata exceeds 8 MiB.')
    for identity, run in runs.items():
        entries['runs/' + identity + '.json'] = encoded(run)
        entries['sources/' + identity + '.py'] = run['source'].encode()
        for ref in run.get('experiments', []):
            raw = files.get(ref['id'])
            if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_UPLOAD_BYTES or sha256(raw).hexdigest() != ref['sha256']:
                raise ValueError('Original artifact is missing or its SHA-256 does not match.')
            entries['artifacts/' + ref['id'] + '.fqx'] = raw
    for run in verification_runs.values():
        validate_run(run)
        for ref in run.get('experiments', []):
            raw = files.get(ref['id'])
            if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_UPLOAD_BYTES or sha256(raw).hexdigest() != ref['sha256']:
                raise ValueError('Verification artifact is missing or mismatched.')
            path = 'artifacts/' + ref['id'] + '.fqx'
            if path in entries and entries[path] != raw: raise ValueError('Verification artifact identity conflict.')
            entries[path] = raw
    if len(entries) > 511 or sum(map(len, entries.values())) > MAX_PACKAGE:
        raise ValueError('Research package exceeds the 64 MiB expanded limit.')
    index = {'schema': SCHEMA, 'files': {name: {'size': len(raw), 'sha256': sha256(raw).hexdigest()} for name, raw in entries.items()}}
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('manifest.json', encoded(index))
        for name, raw in entries.items():
            archive.writestr(name, raw)
    raw = buffer.getvalue()
    if len(raw) > MAX_PACKAGE:
        raise ValueError('Research package exceeds 64 MiB.')
    return raw


def read_package(raw):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_PACKAGE:
        raise ValueError('Select a research ZIP no larger than 64 MiB.')
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            infos = archive.infolist()
            names = [i.filename for i in infos]
            if not 1 <= len(infos) <= 512 or len(set(names)) != len(names) or sum(i.file_size for i in infos) > MAX_PACKAGE:
                raise ValueError('Duplicate files or oversized research package.')
            for info in infos:
                name = info.filename
                if not (name in ('manifest.json', 'research.json') or re.fullmatch(r'(?:(?:runs|verification-runs)/[a-zA-Z0-9-]{1,128}\.json|(?:sources|verification-sources)/[a-zA-Z0-9-]{1,128}\.py|verifications/[a-f0-9]{64}\.json|artifacts/fqx-[a-f0-9]{32}\.fqx)', name)) or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                    raise ValueError('Unsafe or unsupported ZIP entry.')
                limit = MAX_UPLOAD_BYTES if name.startswith('artifacts/') else 8 * 1024 * 1024
                if info.file_size > limit:
                    raise ValueError('ZIP entry is too large.')
            index = json.loads(archive.read('manifest.json'))
            if not isinstance(index, dict) or index.get('schema') not in (SCHEMA, LEGACY_SCHEMA) or not isinstance(index.get('files'), dict) or set(index['files']) != set(names) - {'manifest.json'}:
                raise ValueError('Unsupported package schema or incomplete file index.')
            entries = {}
            for name, expected in index['files'].items():
                content = archive.read(name)
                if not isinstance(expected, dict) or len(content) != expected.get('size') or sha256(content).hexdigest() != expected.get('sha256'):
                    raise ValueError('Package integrity check failed: ' + name)
                entries[name] = content
    except (zipfile.BadZipFile, KeyError, TypeError, UnicodeError, json.JSONDecodeError, zlib.error, RuntimeError, NotImplementedError) as error:
        raise ValueError('Invalid or incomplete research ZIP.') from error
    runs = {}
    for name, content in entries.items():
        if name.startswith('runs/'):
            run = validate_run(json.loads(content))
            if name != 'runs/' + run['id'] + '.json' or entries.get('sources/' + run['id'] + '.py') != run['source'].encode():
                raise ValueError('Archived source identity mismatch.')
            runs[run['id']] = run
    if not 1 <= len(runs) <= 64:
        raise ValueError('Invalid run count.')
    research = research_metadata(json.loads(entries['research.json']), runs)
    snapshots, verification_runs = validate_history(entries, runs)
    if index['schema'] == LEGACY_SCHEMA and (snapshots or verification_runs): raise ValueError('Legacy packages cannot carry verification history.')
    required = {'research.json'}
    required.update(path for path in entries if path.startswith(('verifications/', 'verification-runs/', 'verification-sources/')))
    for run in [*runs.values(), *verification_runs.values()]:
        if run['id'] in runs: required.update(('runs/' + run['id'] + '.json', 'sources/' + run['id'] + '.py'))
        for ref in run.get('experiments', []):
            name = 'artifacts/' + ref['id'] + '.fqx'
            if name not in entries or sha256(entries[name]).hexdigest() != ref['sha256']:
                raise ValueError('Missing or mismatched original artifact.')
            required.add(name)
    if required != set(entries):
        raise ValueError('Research package contains unreferenced entries.')
    return research, runs, entries


class ResearchPackages:
    def __init__(self, settings, experiments, python_runs):
        self.settings, self.experiments, self.python_runs = settings, experiments, python_runs
        self.root = settings.database_path.parent / 'research-packages'
        self.root.mkdir(parents=True, exist_ok=True)
        self.store = SQLiteJobStore(settings.database_path.with_suffix('.research.sqlite3'))
        self.store.initialize()

    def get(self, identity):
        return self.store.get(identity) if re.fullmatch(r'research-[a-f0-9]{32}', str(identity)) else None

    def records(self):
        return [{key: value.get(key) for key in ('id', 'name', 'imported_at', 'run_count')} for value in self.store.list()]

    def export(self, request):
        reports, verification_runs = [], {}
        if request.get('package_id'):
            saved = self.get(request['package_id'])
            if not saved:
                raise ValueError('Imported research record not found.')
            research, runs, entries = read_package((self.root / (saved['id'] + '.zip')).read_bytes())
            if 'adopted' in request: research['adopted'] = request['adopted']
            snapshots, verification_runs = validate_history(entries, runs)
            reports = [s['report'] for s in snapshots]
            files = {ref['id']: entries['artifacts/' + ref['id'] + '.fqx'] for run in [*runs.values(), *verification_runs.values()] for ref in run.get('experiments', [])}
        else:
            research = request.get('research')
            if not isinstance(research, dict) or not isinstance(research.get('runs'), list):
                raise ValueError('Select a research record to export.')
            identities = [row.get('id') for row in research['runs'] if isinstance(row, dict)]
            if len(identities) != len(research['runs']) or len(set(identities)) != len(identities) or not 1 <= len(identities) <= 64:
                raise ValueError('Invalid research run references.')
            runs = {identity: self.python_runs.get(identity) for identity in identities}
            if any(run is None for run in runs.values()):
                raise ValueError('A referenced run is unavailable. A complete package cannot be exported.')
            files, total = {}, 0
            for run in runs.values():
                validate_run(run)
                for ref in run.get('experiments', []):
                    if ref['id'] in files: continue
                    path = self.experiments.file(ref['id'])
                    size = path.stat().st_size
                    if size > MAX_UPLOAD_BYTES or total + size > MAX_PACKAGE:
                        raise ValueError('Research artifacts exceed the 64 MiB package limit.')
                    files[ref['id']] = path.read_bytes()
                    total += size
        reproductions = getattr(self, 'reproductions', None)
        if reproductions:
            for identity in runs:
                for report in reproductions.list({'package_id': request.get('package_id'), 'run_id': identity}):
                    if report['status'] in ('verifying', 'submitting'): raise ValueError('Wait for active verifications to settle before export.')
                    reports.append(report)
                    if len(reports) > 128: raise ValueError('Verification history exceeds 128 reports; nothing was omitted.')
                    if report.get('run_id'):
                        replay = self.python_runs.get(report['run_id'])
                        if replay:
                            validate_run(replay)
                            if replay['id'] in verification_runs and verification_runs[replay['id']] != replay: raise ValueError('Verification run identity conflict.')
                            verification_runs[replay['id']] = replay
                            for ref in replay.get('experiments', []):
                                path = self.experiments.file(ref['id'])
                                size = path.stat().st_size
                                if size > MAX_UPLOAD_BYTES or sum(map(len, files.values())) + (0 if ref['id'] in files else size) > MAX_PACKAGE: raise ValueError('Verification artifacts exceed the package size limit.')
                                files[ref['id']] = path.read_bytes()
        # Snapshot digests deduplicate retained history without rewriting its original scope.
        reports = list({sha256(encoded(report)).hexdigest(): report for report in reports}.values())
        runs = copy.deepcopy(runs)
        for run in runs.values():
            run['research_results'] = {}
            for ref in run.get('experiments', []):
                record = saved['experiments'].get(ref['id']) if request.get('package_id') else self.experiments.get(ref['id'])
                if record: attach_result(record)
                result = (record or {}).get('program', {}).get('experiment', {}).get('research_result')
                if result: run['research_results'][ref['id']] = result
        return make_package(research, runs, files, reports, verification_runs)

    def import_package(self, raw, filename):
        research, runs, entries = read_package(raw)
        snapshots, verification_runs = validate_history(entries, runs)
        identity = 'research-' + uuid.uuid4().hex
        canonical, local_ids, created = {}, {}, []
        with tempfile.TemporaryDirectory(prefix='.research-import-', dir=self.root) as folder:
            stage = ExperimentImports(replace(self.settings, database_path=Path(folder) / 'stage.sqlite3'))
            refs = {}
            for run in [*runs.values(), *verification_runs.values()]:
                for ref in run.get('experiments', []):
                    if ref['id'] in refs and refs[ref['id']][0]['id'] != run['id']:
                        raise ValueError('An artifact is attributed to multiple runs.')
                    refs[ref['id']] = (run, ref)
            for original_id, (run, ref) in refs.items():
                record = stage.import_file(entries['artifacts/' + original_id + '.fqx'], ref['filename'], python_run={**run, 'execution_status': run.get('execution_status', run['status']), 'environment': {'transport': 'archive', **run.get('environment', {})}})
                local_ids[original_id] = record['id']
                copy_record = copy.deepcopy(record)
                info = copy_record['program']['experiment']
                info.update(id=original_id, python_run={**info.get('python_run', {}), 'id': run['id'], 'source_hash': run['source_hash'], 'execution_status': run['status'], 'transport': run.get('environment', {}).get('transport', 'archive')})
                origin = {'language': 'python', 'source': run['source'], 'run_id': run['id'], 'source_hash': run['source_hash'], 'execution_status': run['status']}
                copy_record.update(id=original_id)
                copy_record['program'].update(id=original_id, origin=origin)
                if copy_record.get('job'):
                    copy_record['job'].update(id=original_id, origin=origin, experiment=info)
                attach_result(copy_record)
                canonical[original_id] = copy_record
            archived = project_history(snapshots, runs, canonical)
            saved = {'id': identity, 'status': 'imported', 'name': Path(filename).name[:160], 'imported_at': int(time.time() * 1000), 'run_count': len(runs),
                     'research': research, 'runs': runs, 'experiments': canonical, 'local_ids': local_ids, 'archived_verifications': archived}
            if len(encoded(saved)) > 16 * 1024 * 1024:
                raise ValueError('Research preview exceeds 16 MiB; use the SDK for larger archives.')
            try:
                for local_id in local_ids.values():
                    record = stage.get(local_id)
                    destination = self.experiments.root / (record['id'] + '.fqx')
                    with destination.open('xb') as output:
                        created.append(record['id'])
                        output.write(stage.file(record['id']).read_bytes())
                    self.experiments.store.put(record)
                (self.root / (identity + '.zip')).write_bytes(raw)
                self.store.put(saved)
            except Exception:
                for new_id in created:
                    (self.experiments.root / (new_id + '.fqx')).unlink(missing_ok=True)
                (self.root / (identity + '.zip')).unlink(missing_ok=True)
                for new_id in created:
                    self.experiments.store.delete(new_id)
                self.store.delete(identity)
                raise
        return saved
