"""Explicit archived-source reproduction; native PythonRuns owns execution."""
import ast
import copy
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import uuid
from .job_store import SQLiteJobStore
from .research_packages import validate_run
from .environment_plan import environment_plan, source_imports

TOLERANCE = {'absolute': 1e-7, 'relative': 1e-6}
PROBE = (Path(__file__).with_name('runtime_facts.py')).read_text() + "\n" + """import json
fq = None
errors = []
try:
    import flagquantum as fq
except Exception:
    errors.append('flagquantum')
try:
    import torch
except Exception:
    errors.append('torch')
"""



def equal(a, b, tolerant=False):
    if type(a) in (float, int) and type(b) in (float, int):
        return math.isfinite(a) and math.isfinite(b) and (math.isclose(a, b, abs_tol=TOLERANCE['absolute'], rel_tol=TOLERANCE['relative']) if tolerant else a == b)
    if type(a) != type(b): return False
    if isinstance(a, dict): return a.keys() == b.keys() and all(equal(a[k], b[k], tolerant) for k in a)
    if isinstance(a, list): return len(a) == len(b) and all(equal(x, y, tolerant) for x, y in zip(a, b))
    return a == b


def complete_value(value):
    if isinstance(value, dict):
        if value.get('truncated'): raise ValueError('A result preview is truncated; verification is incomplete.')
        if 'shape' in value and 'values' in value:
            shape = value['shape']
            if not isinstance(shape, list) or any(type(v) != int or v < 0 for v in shape) or math.prod(shape) != len(value['values']):
                raise ValueError('Saved tensor values do not match their shape.')
        for item in value.values(): complete_value(item)
    elif isinstance(value, list):
        for item in value: complete_value(item)
    elif isinstance(value, float) and not math.isfinite(value):
        raise ValueError('Saved results contain non-finite values.')
    elif isinstance(value, str) and value.lower() in ('nan', 'inf', '-inf', 'infinity', '-infinity'):
        raise ValueError('Saved results contain non-finite values.')


def comparable(record):
    program = record['program']; info = program['experiment']; compiled = program['compiled']
    if not info.get('has_result'): raise ValueError('An archive has no saved result.')
    measurements = copy.deepcopy(info['measurements'])
    if not measurements: raise ValueError('No saved measurements to verify.')
    for m in measurements:
        complete_value(m.get('value'))
        m.pop('statistics', None)  # derived presentation, not the measured values
        if isinstance(m.get('value'), dict) and m['value'].get('truncated'):
            raise ValueError('A result preview is truncated; verification is incomplete.')
        if m['kind'] == 'counts':
            batches = m.get('batches')
            if not batches or not m.get('shots'): raise ValueError('Counts are incomplete.')
            for batch in batches:
                keys = [(row['key_type'], row['state']) for row in batch]
                if len(set(keys)) != len(keys) or any(type(row['count']) != int or row['count'] < 0 for row in batch) or sum(row['count'] for row in batch) != m['shots']:
                    raise ValueError('Counts do not match recorded shots.')
                batch.sort(key=lambda row: (row['key_type'], row['state']))
        elif 'value' not in m: raise ValueError('Measurement values are unavailable.')
    circuit = {k: compiled[k] for k in ('qubits', 'instructions', 'measurement_qubits')}
    # Include the saved IR, including matrices/observables absent from diagram previews.
    ir = (info.get('execution_plan') or {}).get('program')
    if ir is not None:
        complete_value(ir)
        circuit['saved_ir'] = ir
    elif any(g.get('name') in ('unitary', 'matrix', 'hamiltonian') for g in circuit['instructions']):
        raise ValueError('Full gate definitions are unavailable; circuit verification is incomplete.')
    return {'circuit': circuit, 'measurements': measurements}


def qaoa_metrics(source, record):
    """Only inspect a literal graph; never evaluate user source."""
    try:
        assignments = [n for n in ast.parse(source).body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'EDGES' for t in n.targets)]
        if len(assignments) != 1: return None
        edges = ast.literal_eval(assignments[0].value)
        n = record['program']['compiled']['qubits']
        if type(n) != int or not 2 <= n <= 12 or not isinstance(edges, (list, tuple)) or not edges: return None
        normalized = []
        for edge in edges:
            if not isinstance(edge, (list, tuple)) or len(edge) not in (2, 3): return None
            u, v = edge[:2]; weight = edge[2] if len(edge) == 3 else 1
            if any(type(q) != int or not 0 <= q < n for q in (u, v)) or u == v: return None
            if type(weight) not in (int, float) or not math.isfinite(weight) or weight <= 0: return None
            normalized.append((min(u, v), max(u, v), weight))
        if len({(u, v) for u, v, _ in normalized}) != len(normalized) or not math.isfinite(sum(w for _, _, w in normalized)): return None
        costs = [sum(w * (format(i, f'0{n}b')[u] != format(i, f'0{n}b')[v]) for u, v, w in normalized) for i in range(2 ** n)]
        ms = record['program']['experiment']['measurements']
        p = next(m for m in ms if m['kind'] == 'probabilities' and m['qubits'] == list(range(n)))['value']
        c = next(m for m in ms if m['kind'] == 'counts' and m['qubits'] == list(range(n)))
        if p.get('truncated') or p.get('complex') or len(p['values']) != len(costs) or len(c['batches']) != 1: return None
        optimum = max(costs)
        return {'expected_cut': sum(v * cost for v, cost in zip(p['values'], costs)), 'optimal_sample_rate': sum(row['count'] for row in c['batches'][0] if row['key_type'] == 'string' and costs[int(row['state'], 2)] == optimum) / c['shots'], 'classical_optimum': optimum}
    except (StopIteration, ValueError, TypeError, KeyError, IndexError, SyntaxError, OverflowError, ZeroDivisionError): return None


def compare_runs(original, replay, expected, actual):
    if replay.get('source_hash') != original['source_hash'] or sha256(replay['source'].encode()).hexdigest() != original['source_hash']:
        raise ValueError('Reproduction source differs from the pinned original.')
    old = {r['filename']: r for r in original.get('experiments', [])}
    new = {r['filename']: r for r in replay.get('experiments', [])}
    if not old or len(old) != len(original['experiments']) or len(new) != len(replay.get('experiments', [])) or old.keys() != new.keys():
        raise ValueError('Expected and reproduced artifact filenames do not match exactly.')
    rows = []
    for name, ref in sorted(old.items()):
        fresh = new[name]; a = expected[ref['id']]; b = actual[fresh['id']]
        if a['program']['experiment']['sha256'] != ref['sha256'] or b['program']['experiment']['sha256'] != fresh['sha256']:
            raise ValueError('Artifact integrity identity changed.')
        origin = b['program'].get('origin', {})
        if origin.get('run_id') != replay['id'] or origin.get('source_hash') != original['source_hash']:
            raise ValueError('Reproduced artifact is not bound to this run and source.')
        x, y = comparable(a), comparable(b)
        circuit = equal(x['circuit'], y['circuit']); circuit_close = equal(x['circuit'], y['circuit'], True)
        # Count integers and seed/shot metadata stay exact, even in tolerance mode.
        counts_exact = equal([m for m in x['measurements'] if m['kind'] == 'counts'], [m for m in y['measurements'] if m['kind'] == 'counts'])
        exact = equal(x, y); close = counts_exact and equal(x, y, True)
        rows.append({'filename': name, 'original_archive': ref, 'reproduced_archive': fresh, 'status': 'exact' if exact else 'tolerance' if close else 'different',
                     'circuit': 'exact' if circuit else 'tolerance' if circuit_close else 'different', 'counts': 'exact' if counts_exact else 'different',
                     'measurements': 'exact' if equal(x['measurements'], y['measurements']) else 'tolerance' if counts_exact and equal(x['measurements'], y['measurements'], True) else 'different',
                     'original_metrics': qaoa_metrics(original['source'], a), 'reproduced_metrics': qaoa_metrics(replay['source'], b)})
    return {'status': 'different' if any(r['status'] == 'different' for r in rows) else 'tolerance' if any(r['status'] == 'tolerance' for r in rows) else 'exact', 'artifacts': rows, 'tolerance': TOLERANCE}


class Reproductions:
    def __init__(self, settings, packages, runs, experiments):
        self.packages, self.runs, self.experiments = packages, runs, experiments
        if packages is not None: packages.reproductions = self
        self.store = SQLiteJobStore(settings.database_path.with_suffix('.reproductions.sqlite3')); self.store.initialize()
        self.lock = threading.RLock()

    def original(self, request):
        package = self.packages.get(request.get('package_id')) if request.get('package_id') else None
        if request.get('package_id') and not package: raise ValueError('Research package not found.')
        run = package['runs'].get(request.get('run_id')) if package else self.runs.get(request.get('run_id'))
        if not run: raise ValueError('Original run not found.')
        validate_run(run)
        if run['status'] != 'completed' or run.get('collection_status') != 'completed' or run.get('collection_errors') or not run.get('experiments'):
            raise ValueError('Select a completed version with fully collected artifacts.')
        records = {ref['id']: package['experiments'][ref['id']] if package else self.experiments.get(ref['id']) for ref in run['experiments']}
        for ref in run['experiments']:
            record = records[ref['id']]
            if not record or record['program']['experiment']['sha256'] != ref['sha256']:
                raise ValueError('Original archive identity is unavailable.')
            local_id = package['local_ids'][ref['id']] if package else ref['id']
            if sha256(self.experiments.file(local_id).read_bytes()).hexdigest() != ref['sha256']:
                raise ValueError('Original archive bytes have changed.')
            comparable(record)
        return run, records

    def check(self, request):
        run, records = self.original(request)
        runtime, inspection_error = {}, None
        try:
            process = subprocess.Popen(self.runs.command(PROBE + "\nresult = runtime_manifest(fq, " + repr(source_imports(run['source'])) + "); result['import_errors'] = errors; print(json.dumps(result))"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
            try: output, errors = process.communicate(timeout=25)
            except subprocess.TimeoutExpired:
                try: os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError: pass
                process.communicate()
                raise ValueError('Runtime inspection timed out. No reproduction was submitted.')
            if process.returncode: raise ValueError('Cannot inspect the configured SDK runtime. Check the interpreter and dependencies. No reproduction was submitted.')
            try:
                runtime = json.loads(output)
                if not isinstance(runtime, dict): raise ValueError()
            except ValueError:
                runtime = {}
                raise ValueError('Runtime inspection returned invalid metadata. No reproduction was submitted.')
        except OSError:
            inspection_error = 'Configured Python executable is unavailable or cannot be started. Check its path and permissions. No reproduction was submitted.'
        except ValueError as error:
            inspection_error = str(error)
        differences = []
        execution = []
        versions = sorted({r['program']['experiment'].get('producer_version') for r in records.values()} - {None})
        if any(v != runtime.get('sdk_version') for v in versions): differences.append('SDK version differs from the archived producer.')
        if run.get('runtime', {}).get('python') and run['runtime']['python'] != runtime.get('python'): differences.append('Python version differs from the original run.')
        for r in records.values():
            info = r['program']['experiment']
            decision = (info.get('execution_plan') or {}).get('decision') or {}
            counts = [m for m in info['measurements'] if m['kind'] == 'counts']
            execution.append({'filename': info.get('filename'), 'backend': decision.get('backend'), 'device': decision.get('device'), 'precision': decision.get('precision'), 'measurements': [{'shots': m.get('shots'), 'seed': m.get('metadata', {}).get('seed')} for m in counts]})
            if decision.get('backend') not in (None, 'pytorch'): differences.append('A recorded backend is not covered by the PyTorch availability probe; its dependencies remain unchecked.')
            facts = info.get('runtime', {})
            if isinstance(facts, dict) and facts.get('device') == 'cuda' and not runtime.get('cuda_available'): differences.append('The archive used CUDA; this runtime has no CUDA device.')
        plan = environment_plan(run, versions, runtime)
        if inspection_error:
            # No runtime inventory was observed: do not claim packages are missing.
            runtime = {}
            plan.update(current={}, blockers=[inspection_error], unresolved_imports=[])
            for dependency in plan['dependencies']:
                dependency.update(current=None, state='unchecked')
            plan['notes'].append('Current runtime inventory is unavailable; dependency availability and compatibility remain unchecked.')
            differences = ['The current runtime could not be inspected. Compatibility is unchecked.']
        identity = 'verify-' + uuid.uuid4().hex
        record = {'id': identity, 'status': 'blocked' if plan['blockers'] else 'prepared', 'created_at': time.time(), 'package_id': request.get('package_id'), 'original_run': run['id'], 'source_hash': run['source_hash'],
                  'original_archives': run['experiments'], 'configured_environment': self.runs.environment(), 'runtime': runtime, 'producer_versions': versions, 'recorded_execution': execution,
                  'preparation': plan, 'differences': sorted(set(differences)), 'notice': 'Backend and device are selected by the unchanged archived code; external dependencies are not bundled. Version agreement does not guarantee reproduction.'}
        if inspection_error: record['error'] = inspection_error
        self.store.put(record)
        return record

    def start(self, identity):
        with self.lock:
            saved = self.store.get(identity)
            if not saved: raise ValueError('Check the environment first.')
            if saved['status'] != 'prepared': return self.get(identity)
            if time.time() - saved['created_at'] > 600: raise ValueError('Environment check expired; check again before running.')
            request = {'package_id': saved['package_id'], 'run_id': saved['original_run']}
            run, _ = self.original(request)
            if run['source_hash'] != saved['source_hash'] or run['experiments'] != saved['original_archives'] or self.runs.environment() != saved['configured_environment']:
                raise ValueError('Source, artifacts or configured environment changed. Check again.')
            saved.update(status='submitting'); self.store.put(saved)
            try:
                replay = self.runs.submit({'source': run['source'], 'name': 'Reproduce · ' + run.get('name', run['id'])})
                saved.update(status='verifying', run_id=replay['id'])
                self.store.put(saved)
            except Exception:
                # Never retry an uncertain submission automatically.
                saved.update(status='submission_unknown', error='Submission did not return a durable receipt. Inspect Python run history before creating another check.')
                self.store.put(saved)
                raise
            return saved

    def get(self, identity):
        with self.lock:
            saved = self.store.get(identity)
            if not saved: raise ValueError('Verification record not found.')
            if saved['status'] not in ('verifying', 'submitting'): return saved
            run = self.runs.get(saved.get('run_id'))
            if not run:
                saved.update(status='submission_unknown', error='Run receipt unavailable; inspect Python history. No task was resubmitted.')
            elif run['status'] not in ('queued', 'running') and run.get('collection_status') not in ('pending', 'collecting'):
                saved['completed_at'] = time.time(); saved['reproduced_runtime'] = run.get('runtime', {})
                if run['status'] != 'completed' or run.get('collection_status') != 'completed' or run.get('collection_errors'):
                    saved.update(status='failed', error=run.get('error') or 'Execution or artifact collection failed. Inspect the original run logs.')
                else:
                    try:
                        original, expected = self.original({'package_id': saved['package_id'], 'run_id': saved['original_run']})
                        if original['source_hash'] != saved['source_hash'] or original['experiments'] != saved['original_archives']: raise ValueError('Original evidence changed after submission.')
                        actual = {ref['id']: self.experiments.get(ref['id']) for ref in run.get('experiments', [])}
                        for ref in run.get('experiments', []):
                            if sha256(self.experiments.file(ref['id']).read_bytes()).hexdigest() != ref['sha256']:
                                raise ValueError('Reproduced archive bytes have changed.')
                        saved.update(compare_runs(original, run, expected, actual))
                    except (ValueError, KeyError, TypeError, OSError) as error: saved.update(status='incomplete', error=str(error))
            if saved['status'] != 'verifying': self.store.put(saved)
            return saved

    def list(self, request):
        return [self.get(r['id']) for r in self.store.list(limit=None) if r.get('package_id') == request.get('package_id') and r['original_run'] == request.get('run_id')]
