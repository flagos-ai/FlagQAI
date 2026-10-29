"""Injected into a Python task as flagquantum_web; publishes explicit SDK outputs."""
import collections
import json
import os
from pathlib import Path


def publish(circuit, result=None, name='Python circuit'):
    import flagquantum as fq
    from flagquantum.compiler.openqasm import emit_openqasm
    compiled = fq.compile(circuit)
    if not 1 <= compiled.n_wires <= 16 or len(compiled.instructions) > 2000:
        raise ValueError('Web visualization supports 1–16 qubits and at most 2000 gates.')
    source = emit_openqasm(compiled, version=2.0)
    depths = [0]*compiled.n_wires
    instructions = []
    for gate in compiled.instructions:
        depth = max((depths[w] for w in gate.wires), default=0)+1
        for wire in gate.wires: depths[wire] = depth
        instructions.append({'name':gate.name, 'wires':list(gate.wires),
            'params':{k:v.tolist() if hasattr(v,'tolist') else v for k,v in gate.params.items()}})
    metadata = {'version':fq.__version__, 'qubits':compiled.n_wires, 'depth':max(depths,default=0),
        'instructions':instructions, 'gate_counts':dict(collections.Counter(g.name for g in compiled.instructions)),
        'backend':'flagquantum_python', 'registers':[], 'groups':{}}
    artifact = {'name':str(name)[:100], 'source':source, 'compiled':metadata}
    if result is not None:
        metadata['runtime'] = dict(result.runtime)
        for measurement in result.measurements:
            if measurement.kind == 'counts':
                counts = measurement.value[0]
                artifact['counts'] = {str(k):int(v) for k,v in counts.items()}
                artifact['shots'] = sum(counts.values())
                break
        try:
            vector = result.statevector().reshape(-1)
            if len(vector) <= 1024:
                artifact['statevector'] = [[float(v.real),float(v.imag)] for v in vector]
        except (ValueError, RuntimeError): pass
    encoded = json.dumps(artifact, allow_nan=False)
    if len(encoded.encode()) > 1024*1024: raise ValueError('Published artifact exceeds 1 MiB.')
    Path(os.environ['FQ_WEB_ARTIFACT']).write_text(encoded, encoding='utf-8')
