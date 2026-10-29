"""Read an FQX experiment with the installed SDK; never compile or execute it."""
from collections import Counter
import json
from pathlib import Path
import sys
import zipfile


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
    if not 1 <= ir.n_wires <= 16 or len(ir.instructions) > 2000:
        raise ValueError('Web import supports 1–16 qubits and at most 2000 gates.')
    source = emit_openqasm(ir, version=2.0)
    if len(source.encode()) > 32768:
        raise ValueError('The exported circuit exceeds the Web source limit of 32 KiB.')
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
            measurements.append(record)
    measured = set()
    for measurement in ir.measurements:
        if measurement.kind == 'counts':
            measured.update(range(ir.n_wires) if measurement.wires is None else measurement.wires)
    if result is not None:
        for measurement in result.measurements:
            if measurement.kind == 'counts':
                measured.update(measurement.qubits)
    compiled['measurement_qubits'] = sorted(measured)
    record = {'producer_version': producer, 'has_result': result is not None,
              'program_hash': ir.content_hash, 'measurements': measurements,
              'execution_plan': plain(experiment.execution_plan)}
    if result is not None:
        record.update(accuracy=plain(result.accuracy.to_dict()), runtime=plain(result.runtime),
                      provenance=plain(result.provenance), metrics=plain(result.metrics),
                      value=plain(result.value), state=plain(result.state), samples=plain(result.samples))
    payload = {'source': source, 'compiled': compiled, 'experiment': record}
    encoded = json.dumps(payload, allow_nan=False)
    if len(encoded.encode()) > 2 * 1024 * 1024:
        raise ValueError('Experiment preview exceeds 2 MiB; use the SDK to inspect this file.')
    return payload


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
