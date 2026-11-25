"""Read an FQX experiment with the installed SDK; never compile or execute it."""
from collections import Counter
import json
import runpy
from pathlib import Path
import sys
import zipfile


def state_distribution(result, n_qubits):
    """Read probabilities from a complete saved pure state; never execute a plan."""
    import torch
    try:
        vector = result.statevector()
    except (ValueError, RuntimeError, AttributeError):
        return None
    if not isinstance(vector, torch.Tensor) or vector.numel() != 2 ** n_qubits or vector.numel() > 1048576:
        return None
    if not vector.ndim or vector.shape[-1] != 2 ** n_qubits:
        return None
    vector = vector.detach().cpu().reshape(-1).to(torch.complex128 if vector.is_complex() else torch.float64)
    probabilities = vector.abs().double().square()
    if not bool(torch.isfinite(probabilities).all()):
        return None
    threshold = 1e-14
    support = torch.nonzero(probabilities > threshold).reshape(-1)
    ordered = support[torch.argsort(probabilities[support], descending=True, stable=True)][:256]
    total = float(probabilities.sum())
    import math
    if not math.isfinite(total):
        return None
    entries = [{'state': format(int(index), f'0{n_qubits}b'), 'probability': float(probabilities[index])} for index in ordered]
    return {'kind': 'statevector', 'qubits': n_qubits, 'total_probability': total,
            'support_size': len(support), 'threshold': threshold, 'entries': entries,
            'omitted_probability': max(0.0, total - sum(row['probability'] for row in entries))}


def project(path):
    try:
        import flagquantum as fq
        from flagquantum.compiler.openqasm import emit_openqasm
    except ImportError as error:
        raise ValueError("Configure FQ_EXPERIMENT_PYTHON with FlagQuantum and PyTorch installed.") from error
    if not callable(getattr(fq, 'load', None)):
        raise ValueError('Install FlagQuantum with fq.load support in FQ_EXPERIMENT_PYTHON.')
    experiment = fq.load(path)
    ir = experiment.program
    helpers = Path(__file__).parent
    limits = runpy.run_path(str(helpers / 'preview_limits.py'))
    limits['validate_preview_size'](ir.n_wires, len(ir.instructions))
    source = emit_openqasm(ir, version=2.0)
    if len(source.encode()) > 512 * 1024:
        raise ValueError('The archived circuit exceeds the preview source limit of 512 KiB.')
    with zipfile.ZipFile(path) as archive:
        producer = json.loads(archive.read('manifest.json'))['producer']['version']
    depths = [0] * ir.n_wires
    instructions = []
    for gate in ir.instructions:
        depth = max((depths[q] for q in gate.wires), default=0) + 1
        for q in gate.wires:
            depths[q] = depth
        instructions.append({'name': gate.name, 'wires': list(gate.wires),
                             'params': {key: value.detach().cpu().tolist() if hasattr(value, 'detach') else value for key, value in gate.params.items()}})
    compiled = {'version': producer, 'qubits': ir.n_wires, 'depth': max(depths, default=0),
                'instructions': instructions, 'gate_counts': dict(Counter(g.name for g in ir.instructions)),
                'backend': 'fqx_archive', 'transport': 'archive', 'registers': [], 'groups': {}}
    # Share the pure compiler-attribution projection with the Python publisher.
    projection = runpy.run_path(str(helpers / 'synthesis_projection.py'))
    compiled.update(projection['project_synthesis'](ir, instructions))
    result = experiment.result
    measurements = []
    if result is not None:
        if len(result.measurements) > 128:
            raise ValueError('Web import supports at most 128 recorded measurements.')
        for measurement in result.measurements:
            values = measurement.value
            record = {'kind': measurement.kind, 'qubits': list(measurement.qubits),
                      'shots': measurement.shots, 'metadata': plain(measurement.metadata),
                      'statistics': plain(measurement.statistics)}
            if measurement.kind == 'counts':
                if len(values) > 64 or sum(len(batch) for batch in values) > 65536:
                    raise ValueError('Web counts exceed 64 batches or 65536 recorded outcomes.')
                record['batches'] = [[{'state': str(key), 'key_type': 'integer' if type(key) is int else 'string',
                                      'count': count} for key, count in batch.items()] for batch in values]
            else:
                record['value'] = plain(values)
                if measurement.kind == 'sample':
                    batches = sample_histograms(values, len(measurement.qubits))
                    if batches is not None:
                        record['batches'] = batches
            measurements.append(record)
    measured = set()
    for measurement in ir.measurements:
        if measurement.kind == 'counts':
            measured.update(range(ir.n_wires) if measurement.wires is None else measurement.wires)
    for measurement in measurements:
        if measurement['kind'] == 'counts':
            measured.update(measurement['qubits'])
    count_wires = sorted(measured)
    for measurement in measurements:
        if measurement['kind'] == 'sample' and measurement.get('batches'):
            measured.update(measurement['qubits'])
    compiled['measurement_qubits'] = sorted(measured)
    record = {'producer_version': producer, 'has_result': result is not None,
              'program_hash': ir.content_hash, 'measurements': measurements,
              'sample_histogram_version': 1,
              'execution_plan': plain(experiment.execution_plan)}
    if result is not None:
        record.update(state_distribution=state_distribution(result, ir.n_wires), accuracy=plain(result.accuracy.to_dict()), runtime=plain(result.runtime),
                      provenance=plain(result.provenance), metrics=plain(result.metrics),
                      value=plain(result.value), state=plain(result.state), samples=plain(result.samples))
    payload = {'source': source, 'compiled': compiled, 'experiment': record}
    encoded = json.dumps(payload, allow_nan=False)
    if len(encoded.encode()) > 2 * 1024 * 1024:
        # Derived histograms must not prevent opening an otherwise valid archive.
        for measurement in measurements:
            if measurement['kind'] == 'sample':
                measurement.pop('batches', None)
        compiled['measurement_qubits'] = count_wires
        encoded = json.dumps(payload, allow_nan=False)
    if len(encoded.encode()) > 2 * 1024 * 1024:
        raise ValueError('Experiment preview exceeds 2 MiB; use the SDK to inspect this file.')
    return payload


def sample_histograms(value, width):
    """Aggregate complete saved shots, never the truncated tensor preview."""
    import torch
    if (not isinstance(value, torch.Tensor) or value.ndim != 3
            or value.shape[2] != width or not 1 <= width <= 16
            or not 1 <= value.shape[0] <= 64 or value.shape[1] < 1 or value.numel() > 16 * 1024 * 1024):
        return None
    samples = value.detach().cpu()
    if not bool(((samples == 0) | (samples == 1)).all()):
        return None
    batches, outcomes = [], 0
    for batch in samples:
        states, counts = torch.unique(batch, dim=0, return_counts=True, sorted=True)
        outcomes += len(states)
        if outcomes > 65536:
            return None
        batches.append([{'state':''.join(str(int(bit)) for bit in row), 'key_type':'string', 'count':int(count)}
                        for row, count in zip(states.tolist(), counts.tolist())])
    return batches


def plain(value, depth=0):
    """Bound numeric previews; the original FQX file retains complete arrays."""
    import torch
    from collections.abc import Mapping
    if depth > 40:
        raise ValueError('Experiment preview metadata is nested too deeply.')
    if isinstance(value, torch.Tensor):
        tensor = value.detach().cpu().reshape(-1)
        truncated = tensor.numel() > 1024
        tensor = tensor[:1024]
        values = [[v.real, v.imag] for v in tensor.tolist()] if tensor.is_complex() else tensor.tolist()
        # JSON has no NaN/Infinity; retain their explicit scientific meaning as labels.
        import math
        def number(v):
            if isinstance(v, list): return [number(item) for item in v]
            return str(v) if isinstance(v, float) and not math.isfinite(v) else v
        return {'dtype': str(value.dtype).removeprefix('torch.'), 'shape': list(value.shape),
                'values': number(values), 'truncated': truncated, 'complex': tensor.is_complex()}
    if isinstance(value, Mapping):
        if any(not isinstance(key, str) for key in value):
            return {'mapping_entries': [{'key': key, 'value': plain(item, depth + 1)} for key, item in value.items()]}
        return {key: plain(item, depth + 1) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v, depth + 1) for v in value]
    return value


if __name__ == '__main__':
    # This package contains http.py; do not shadow Python's stdlib http package.
    sys.path = [entry for entry in sys.path if Path(entry).resolve() != Path(__file__).parent]
    try:
        print(json.dumps({'ok': True, 'data': project(Path(sys.argv[1]))}, allow_nan=False))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)[:1000]}))
        sys.exit(1)
