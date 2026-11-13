"""Versioned, archive-bound research metrics. Reads evidence; never executes code."""
import ast
from hashlib import sha256
import json
import math

SCHEMA = 'flagqai.research-result.v1'


def digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def graph(source):
    tree = ast.parse(source)
    assignments = [node for node in ast.walk(tree) if isinstance(node, (ast.Assign, ast.AnnAssign))
                   and any(isinstance(target, ast.Name) and target.id == 'EDGES'
                           for target in (node.targets if isinstance(node, ast.Assign) else [node.target]))]
    if len(assignments) != 1 or assignments[0] not in tree.body:
        raise ValueError('One top-level literal EDGES definition is required.')
    # The automatic adapter cannot resolve per-artifact graphs in multi-problem loops.
    if any(isinstance(node, ast.For) and isinstance(node.target, (ast.Tuple, ast.List))
           and any(isinstance(v, ast.Name) and v.id in ('edges', 'EDGES') for v in node.target.elts)
           for node in ast.walk(tree)):
        raise ValueError('Per-artifact graph selection requires explicit evidence.')
    rows = ast.literal_eval(assignments[0].value)
    if not isinstance(rows, (list, tuple)) or not 1 <= len(rows) <= 66:
        raise ValueError('Unsupported graph size.')
    edges = []
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) not in (2, 3): raise ValueError('Invalid edge.')
        u, v = row[:2]; w = row[2] if len(row) == 3 else 1
        if type(u) is not int or type(v) is not int or not 0 <= u < 12 or not 0 <= v < 12 or u == v:
            raise ValueError('Invalid vertex.')
        if type(w) not in (int, float) or not math.isfinite(w) or w <= 0: raise ValueError('Invalid weight.')
        edges.append([min(u, v), max(u, v), w])
    edges.sort()
    if len({(u, v) for u, v, _ in edges}) != len(edges): raise ValueError('Repeated edge.')
    n = max(max(u, v) for u, v, _ in edges) + 1
    if not math.isfinite(sum(w for _, _, w in edges)): raise ValueError('Nonfinite total weight.')
    return {'kind': 'maxcut', 'nodes': n, 'edges': edges, 'basis_order': 'q0-first', 'objective_unit': 'cut weight'}


def build_result(program):
    info, origin, compiled = program.get('experiment') or {}, program.get('origin') or {}, program.get('compiled') or {}
    source = origin.get('source')
    if not info.get('has_result') or not isinstance(source, str) or len(source.encode()) > 32768: return None
    source_hash = sha256(source.encode()).hexdigest()
    python = info.get('python_run') or {}
    if (origin.get('source_hash') != source_hash or python.get('source_hash') != source_hash
            or not origin.get('run_id') or origin['run_id'] != python.get('id')): return None
    try:
        problem = graph(source); n = problem['nodes']
        if compiled.get('qubits') != n: return None
        costs = [sum(w for u, v, w in problem['edges'] if ((i >> (n-1-u)) & 1) != ((i >> (n-1-v)) & 1)) for i in range(2**n)]
        optimum = max(costs)
        metrics = []
        def add(key, label, value, unit, direction='maximize', method='exact'):
            if not math.isfinite(value): raise ValueError('Nonfinite metric.')
            metrics.append({'key': key, 'label': label, 'value': value, 'unit': unit, 'direction': direction, 'method': method})
        counts_shots = None
        for kind in ('probabilities', 'counts'):
            matches = [m for m in info.get('measurements', []) if m.get('kind') == kind]
            if not matches: continue
            if len(matches) != 1 or matches[0].get('qubits') != list(range(n)): return None
            m = matches[0]
            if kind == 'probabilities':
                preview = m.get('value') or {}; values = preview.get('values')
                if (preview.get('truncated') or preview.get('complex') or preview.get('shape') != [1, 2**n]
                        or not isinstance(values, list) or len(values) != 2**n
                        or any(type(p) not in (int, float) or not math.isfinite(p) or p < 0 for p in values)
                        or abs(sum(values)-1) > 1e-5): return None
                add('expected_cut', 'Expected cut', sum(p*c for p, c in zip(values, costs)), 'cut weight')
                add('optimum_probability', 'Optimum probability', sum(p for p, c in zip(values, costs) if c == optimum), 'probability')
            else:
                batches = m.get('batches')
                if not isinstance(batches, list) or len(batches) != 1: return None
                rows = batches[0]; seen = set(); pairs = []
                for row in rows:
                    state = row['state']; count = row['count']
                    if (row['key_type'] != 'string' or len(state) != n or any(c not in '01' for c in state)
                            or state in seen or type(count) is not int or count < 0): return None
                    seen.add(state); pairs.append((int(state, 2), count))
                counts_shots = sum(c for _, c in pairs)
                if type(m.get('shots')) is not int or not counts_shots or counts_shots != m['shots']: return None
                add('sampled_mean_cut', 'Sampled mean cut', sum(costs[i]*c for i, c in pairs)/counts_shots, 'cut weight', method='sampled')
                add('sampled_optimum_rate', 'Sampled optimum rate', sum(c for i, c in pairs if costs[i] == optimum)/counts_shots, 'probability', method='sampled')
        if not metrics: return None
        options = (info.get('execution_plan') or {}).get('resolved_options') or {}
        rotations = [{'operation': i + 1, 'gate': g['name'], 'qubits': g['wires'], 'values': g['params'], 'unit': 'rad' if set(g['params']).issubset({'theta', 'phi', 'lam', 'lambda', 'gamma', 'beta'}) else 'gate-defined'}
                     for i, g in enumerate(compiled.get('instructions', [])) if g.get('params')]
        constants = {}
        for node in ast.parse(source).body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ('N', 'GRID', 'SHOTS', 'SEED', 'P', 'GAMMA', 'BETA'):
                try:
                    value = ast.literal_eval(node.value)
                    if type(value) in (int, float) and math.isfinite(value): constants[node.targets[0].id] = value
                except (ValueError, TypeError): pass
        resources = [{'key': 'qubits', 'label': 'Qubits', 'value': n, 'unit': 'qubits', 'scope': 'circuit'},
                     {'key': 'gates', 'label': 'Gates', 'value': len(compiled['instructions']), 'unit': 'gates', 'scope': 'circuit'},
                     {'key': 'depth', 'label': 'Depth', 'value': compiled['depth'], 'unit': 'layers', 'scope': 'circuit'},
                     {'key': 'two_qubit_gates', 'label': 'Two-qubit gates', 'value': sum(len(g['wires']) == 2 for g in compiled['instructions']), 'unit': 'gates', 'scope': 'circuit'}]
        if counts_shots is not None: resources.append({'key': 'shots', 'label': 'Shots', 'value': counts_shots, 'unit': 'shots', 'scope': 'experiment'})
        elapsed = python.get('elapsed_seconds')
        if type(elapsed) in (int, float) and math.isfinite(elapsed) and elapsed >= 0:
            resources.append({'key': 'run_seconds', 'label': 'Run time', 'value': elapsed, 'unit': 's', 'scope': 'whole Python run'})
        body = {'schema': SCHEMA, 'method': 'maxcut-saved-measurements.v1',
                'binding': {'run_id': origin['run_id'], 'source_sha256': source_hash, 'archive_sha256': info['sha256'], 'program_hash': info['program_hash']},
                'problem': {**problem, 'sha256': digest(problem), 'classical_optimum': optimum},
                'metrics': metrics, 'parameters': {'execution': options, 'source_constants': constants, 'rotations': rotations}, 'resources': resources,
                'execution_status': python.get('execution_status'),
                'limitations': 'Metrics evaluate saved measurements against EDGES declared in the frozen source. This does not certify the circuit implements that objective or establish quantum advantage. Sampled changes are observations, not significance tests.'}
        return {**body, 'sha256': digest(body)}
    except (ValueError, TypeError, KeyError, SyntaxError, OverflowError, RecursionError):
        return None


def attach_result(record):
    """Recompute from immutable projection, including after portable import/remapping."""
    info = record['program'].get('experiment')
    if info is None: return record
    report = build_result(record['program'])
    if report: info['research_result'] = report
    else: info.pop('research_result', None)
    if record.get('job'): record['job']['experiment'] = info
    return record
