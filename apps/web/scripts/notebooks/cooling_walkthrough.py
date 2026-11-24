"""Build a transparent workbench walkthrough from unchanged pinned implementations."""
import ast
import base64
from hashlib import sha256
import json

SLUG = 'applications/automotive/cooling_systems_optimization/overview'
BASE = 'examples/synthesis/' + SLUG + '/'
VERSION = 'cooling-expanded-v1'


def definition(files, module, name):
    source = files[module]
    node = next(node for node in ast.parse(source).body
                if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name == name)
    start = min([node.lineno] + [decorator.lineno for decorator in getattr(node, 'decorator_list', [])])
    # The original modules share a namespace through imports. In the walkthrough
    # these definitions share the notebook namespace instead; bodies stay intact.
    return '\n'.join(source.splitlines()[start - 1:node.end_lineno]).replace('model.', '').replace('quantum.', '')


def build(files, revision, upstream_hash):
    cells = []

    def markdown(text):
        cells.append({'cell_type': 'markdown', 'metadata': {}, 'source': text.strip().splitlines(keepends=True)})

    def code(text):
        cells.append({'cell_type': 'code', 'metadata': {}, 'source': text.strip().splitlines(keepends=True), 'outputs': [], 'execution_count': None})

    def defs(module, *names):
        return '\n\n\n'.join(definition(files, module, name) for name in names)

    model, quantum, workflow = (BASE + name + '.py' for name in ('model', 'quantum', 'workflow'))
    shared = 'examples/synthesis/applications/cfd/qls_for_hybrid_solvers/verify_block_encoding/overview/quantum.py'
    # Recover the original pinned input without importing or executing its module.
    data_node = ast.parse(files['notebook_input_000.py']).body[-1].value
    costs = json.loads(base64.b64decode(ast.literal_eval(data_node.args[0])))['costs']
    markdown('''# Cooling-system optimization: from thermal model to quantum execution

This workbench walkthrough expands the pinned FlagQuantum example. Run cells in order; the core quantum definitions, synthesis calls and executions are visible below, rather than hidden behind `workflow.run()`.

**Two separate experiments:** first solve a four-node thermal system with a degree-11 QSVT inverse and compare it with a classical solve. Then evaluate an eight-qubit, one-phase-bit **mock** design circuit using 64 supplied costs and two angle pairs. The mock costs are not freshly computed thermal objectives. This is neither a completed physical design optimizer nor a quantum advantage demonstration.

The optional full design has 20 qubits and five phase bits; it is defined at the end but is not constructed or executed by Run all. Original companion modules remain available through **How this notebook uses FlagQuantum**.''')
    markdown('''## 1. Problem, data and classical reference

Four nodes exchange heat through six optional links. A six-bit word chooses which links exist. The linear system is `A · temperature_offset = heat`; offsets are in kelvin relative to 293 K ambient. This is a classical physical model, before quantum encoding.''')
    code('''import json
import math
from dataclasses import dataclass, replace
from pathlib import Path

import matplotlib.pyplot as plt
import torch
import flagquantum as fq
from flagquantum import synth
from flagquantum.synth import Output, QArray, QBit, prepare_amplitudes, qfunc
from flagquantum.compiler import ResourceEstimate, estimate_resources
from flagquantum.algorithms.primitives.qft import qft

# Classical numerical phase fitting remains a companion helper, not a quantum execution.
from examples.synthesis.applications.cfd.qls_for_hybrid_solvers.qls_qsvt.overview.phases import PhaseFit, fit, response

REAL, COMPLEX = torch.float64, torch.complex128
AMBIENT, R_ENV = 293, 0.001
HEAT = (2000.0, 4000.0, -200.0, -2000.0)
EDGES = ((0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3))
RESISTANCES = (0.005, 0.006, 0.006, 0.007, 0.007, 0.008)
CONFIGURATIONS = 1 << len(EDGES)
'''+defs(model, 'build_matrix', 'weights', 'alpha'))
    code('''matrix = build_matrix(63)
heat = torch.tensor(HEAT, dtype=REAL)
reference = torch.linalg.solve(matrix, heat)
print("All-links thermal matrix:\\n", matrix)
print("Classical signed temperature offsets (K):", reference.tolist())
print("Absolute temperatures (K):", (reference + AMBIENT).tolist())
assert torch.allclose(matrix @ reference, heat)
''')
    markdown('''## 2. High-level state preparation → synthesis → executable circuit

FlagQuantum's `@qfunc` describes amplitude preparation on an output register. `synth.synthesize()` compiles it under explicit qubit/workspace limits; `Circuit.from_ir()` brings that compiled program into the larger circuit. The thermal oracle below is built with `fq.Circuit` and explicit matrices; it is **not** an end-to-end high-level synthesis of the thermal problem.''')
    code(defs(shared, 'prepare', 'preparation').replace('CTYPE', 'COMPLEX'))
    code('''normalized_heat = heat / heat.norm()
heat_program = synth.synthesize(
    prepare, classical_inputs={"amplitudes": tuple(normalized_heat.tolist())},
    max_qubits=2, max_workspace=0,
)
print("Synthesized heat preparation registers:", heat_program.registers)
print("Preparation resources:", estimate_resources(heat_program.circuit))
heat_result = fq.run(heat_program)
print("Prepared amplitudes:", heat_result.statevector())
''')
    markdown('''## 3. Construct the thermal block encoding

The seven-wire circuit uses three selector wires, two block wires and two data wires. `compose`, `adjoint` and `any(matrix=...)` assemble the LCU encoding. The top-left block should equal `A / alpha`; we execute all basis columns to check it. Explicit dense `any` operators are simulator-level operations, not a decomposed hardware or Clifford+T resource count.''')
    code('''THERMAL_DATA, THERMAL_BLOCK, THERMAL_WIDTH = 2, 5, 7
FULL_QAE_BITS, MOCK_QAE_BITS = 5, 1
QAE_PHASE_WEIGHT = math.sin(math.pi / (1 << FULL_QAE_BITS))
DESIGN_BITS = len(EDGES)
'''+defs(quantum, 'pair_block', 'thermal_encoding', 'unitary'))
    code('''block = thermal_encoding(63)
signal = unitary(block)
matrix_error = float((signal[:4, :4] * alpha() - matrix).abs().max())
assert matrix_error < 1e-10
print("Block-encoding maximum error:", matrix_error)
print("Block resources:", estimate_resources(block))
''')
    markdown('''## 4. Check every coherent design branch

Here the six design wires control the thermal oracle. All 64 normalized heat inputs are executed in one batch using `Circuit.from_ir(..., inputs=..., bsz=64)`. The check compares each projected branch against its independently regenerated classical matrix and rejects leakage between design words.''')
    code(defs(quantum, 'conditional_thermal_encoding')+'\n\n\n'+defs(workflow, 'verify_conditional'))
    code('''conditional_error, conditional_resources = verify_conditional(normalized_heat.to(COMPLEX))
print("64-branch conditional maximum error:", conditional_error)
print("Conditional resources:", conditional_resources)
''')
    markdown('''## 5. Fit the reciprocal and build the inverse circuit

The reciprocal is a classical polynomial/phase-fitting step. The **thermal** interval starts at `1 / (alpha · R_ENV)`. A separate illustration uses `[1/3, 1]` and target `0.3/x`; these targets must not be confused.

The visible inverse circuit prepares signed heat amplitudes, applies twelve phase rotations and eleven alternating block/adjoint queries, then projects the signal/work wires. No opaque solver call replaces this construction.''')
    code(defs(model, 'Reciprocal', 'inverse_target', 'spectral_solution')+'\n\n\n'+defs(quantum, 'inverse_circuit'))
    code('''reciprocal = inverse_target(1 / (alpha() * R_ENV), 11)
demo_reciprocal = inverse_target(1 / 3, 11, target_scale=0.3)
grid = torch.linspace(1 / 3, 1, 1025, dtype=REAL)
assert float((response(grid, demo_reciprocal.fit.phases) - 0.3 / grid).abs().max()) < 0.1
inverse = inverse_circuit(reciprocal)
print("Thermal inverse phase count:", reciprocal.fit.phases.numel())
print("Thermal inverse resources:", estimate_resources(inverse))
''')
    markdown('''## 6. Execute and verify the thermal solution

`fq.run()` executes the inverse; extracting its first four amplitudes is a projection, not a deterministic hardware readout. Rescaling gives approximate signed temperature offsets. Compare the state with independent diagonalization and the physical solution with `torch.linalg.solve`. The degree-11 approximation allows less than 4% relative thermal error.''')
    code('''inverse_result = fq.run(inverse)
projected = -inverse_result.statevector().flatten()[:4]
independent = spectral_solution(matrix, reciprocal, normalized_heat)
inverse_error = float((projected - independent).abs().max())
computed = projected.real * heat.norm() / (alpha() * reciprocal.scale)
relative_error = float((computed - reference).norm() / reference.norm())
assert inverse_error < 1e-10
assert relative_error < 0.04
print("Spectral amplitude error:", inverse_error)
print("Relative thermal error:", relative_error)
print("QSVT signed offsets (K):", computed.tolist())
''')
    code('''figure, axes = plt.subplots(1, 2, figsize=(10, 3.5), layout="constrained")
axes[0].plot(grid.tolist(), (0.3 / grid).tolist(), "--", label="0.3/x")
axes[0].plot(grid.tolist(), response(grid, demo_reciprocal.fit.phases).tolist(), label="Degree-11 illustration")
axes[0].set(xlabel="Encoded value", ylabel="Response", title="Separate reciprocal demonstration")
axes[0].legend()
nodes = torch.arange(1, 5, dtype=REAL)
axes[1].bar((nodes - 0.18).tolist(), reference.tolist(), width=0.35, label="Classical solve")
axes[1].bar((nodes + 0.18).tolist(), computed.tolist(), width=0.35, label="QSVT")
axes[1].set(xlabel="Thermal node", ylabel="Offset (K)", title="Thermal result comparison")
axes[1].legend()
plt.show()
plt.close(figure)
''')
    markdown('''## 7. Define the separate one-phase-bit mock design circuit

The following **64 supplied mock costs** are data, not quantum-computed thermal costs. `qae_state` constructs a one-bit mock phase-estimation state classically; high-level synthesis prepares its amplitudes. `mock_qaoa` builds a reusable eight-wire symbolic circuit with six design wires, one phase wire and one acceptance wire. This does not execute the full five-bit thermal QAE algorithm.''')
    code('MOCK_COSTS = '+repr(costs)+'''\ncosts = torch.tensor(MOCK_COSTS, dtype=REAL)
assert costs.shape == (CONFIGURATIONS,)
assert torch.isfinite(costs).all() and ((costs >= 0) & (costs <= 1)).all()
'''+defs(quantum, 'qae_state', 'complex_preparation', 'mock_qaoa'))
    markdown('''## 8. Bind two angle pairs, run and compare

`fq.Parameter`, `bind_parameters` and `fq.run` reuse the same circuit topology. An independent tensor calculation below checks the complete complex state, rather than only a histogram. Exact probabilities are simulator results, not finite-shot QPU measurements. The reported mean is the mean **mock input cost**, not a physical cooling objective; two trials are not an optimizer convergence claim.''')
    code(defs(workflow, 'qae_reference', 'check_qae', 'preparation_reference', 'mock_state'))
    code('''check_qae(costs)
template = mock_qaoa(costs)
assert template.parameter_names == ("beta", "gamma")
BINDINGS = ((0.67, 0.31), (-0.41, 0.23))
trials = []
probability_rows = []
for gamma, beta in BINDINGS:
    bound = template.bind_parameters({"gamma": gamma, "beta": beta})
    trial_result = fq.run(bound)
    state = trial_result.statevector().flatten()
    expected = mock_state(costs, gamma, beta)
    state_error = float((state - expected).abs().max())
    assert state_error < 1e-10
    probabilities = state.reshape(CONFIGURATIONS, 4).abs().square().sum(dim=1)
    assert abs(float(probabilities.sum()) - 1) < 1e-10
    probability_rows.append(probabilities)
    trials.append({"gamma": gamma, "beta": beta, "state_error": state_error,
                   "mean_mock_cost": float(probabilities @ costs)})
print(json.dumps(trials, indent=2))
print("Mock circuit resources:", estimate_resources(template))
figure, axis = plt.subplots(figsize=(10, 3), layout="constrained")
for angles, probabilities in zip(BINDINGS, probability_rows):
    axis.plot(range(CONFIGURATIONS), probabilities.tolist(), label=str(angles))
axis.set(xlabel="Six-bit design word", ylabel="Exact probability", title="Two mock parameter trials")
axis.legend()
plt.show()
plt.close(figure)
''')
    markdown('''## 9. Save and replay the actual circuit

Save the last mock execution with its validation report, alongside the thermal execution. Replay uses the saved executable circuit, not phase fitting or the full research workflow. A successful replay establishes artifact reproducibility for these executions; it does not validate quantum advantage or physical design optimality. Default saves never overwrite an existing artifact.''')
    code('''report = {
    "schema": "flagqai.cooling-walkthrough.v1",
    "thermal": {"matrix_error": matrix_error, "conditional_error": conditional_error,
                "inverse_error": inverse_error, "relative_error": relative_error,
                "classical_offsets_kelvin": reference.tolist(), "qsvt_offsets_kelvin": computed.tolist()},
    "mock_trials": trials, "mock_costs_are_thermal_objectives": False,
    "full_20_qubit_model_executed": False, "quantum_advantage_claim": False,
}
recorded = replace(trial_result, metrics={**trial_result.metrics, "flagqai_cooling": report})
fq.save("cooling-mock.fqx", recorded.plan, result=recorded)
fq.save("cooling-thermal.fqx", inverse_result.plan, result=inverse_result)
archived = fq.load("cooling-mock.fqx")
replayed = fq.run(archived.program)
torch.testing.assert_close(replayed.statevector(), recorded.statevector(), atol=1e-10, rtol=0)
assert archived.result.metrics["flagqai_cooling"] == report
print(json.dumps(report, indent=2))
print("Saved mock circuit replay passed. Edit BINDINGS to explore another pair; choose new filenames to retain each version.")
''')
    markdown('''## 10. Optional full model definition — no execution

The original full design uses `6 design + 5 phase + 9 solver = 20` wires. The definitions below retain the original controlled solver, QAE and QuSO construction, but **Run all does not call them**. Large controlled dense matrices make this a much more expensive simulator workload. Its existence is not evidence that the full design was run or optimized. Review resources and choose a suitable compute environment before calling `build_full_quso` explicitly.''')
    code('''PHASE_BITS, SOLVER_BITS = 5, 9
WIDTH = len(EDGES) + PHASE_BITS + SOLVER_BITS
assert WIDTH == 20
'''+defs(BASE+'full_model.py', 'conditional_solver', 'controlled_step', 'amplitude_estimation', 'build_full_quso'))
    markdown(f'''## Sources and retained helpers

Expanded by the FlagQAI workbench from FlagQuantum revision `{revision}`. Original notebook SHA-256: `{upstream_hash}`. Companion source and upstream notebook remain available; original licenses and attribution apply.

Core construction and execution are inline. The shared `fit` / `response` numerical phase solver remains imported, as do the FlagQuantum SDK, PyTorch and plotting libraries. You can inspect the companion phase solver through the source viewer. No teaching claim should be inferred merely from a printed stage label.''')
    document = {'nbformat': 4, 'nbformat_minor': 5, 'metadata': {
        'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'},
        'language_info': {'name': 'python'},
        'flagqai': {'presentation': VERSION, 'source_revision': revision, 'upstream_notebook_sha256': upstream_hash},
    }, 'cells': cells}
    for index, cell in enumerate(cells):
        cell['id'] = 'cooling-' + str(index)
    return (json.dumps(document, ensure_ascii=False, indent=2) + '\n').encode()


def apply(directory, catalog):
    item = next(item for item in catalog['entries'] if item['path'] == SLUG)
    identity = item['id']
    notebook_path = directory / (identity + '.ipynb')
    original_path = directory / (identity + '.upstream.ipynb')
    if item.get('presentation') != VERSION:
        original_path.write_bytes(notebook_path.read_bytes())
    original = original_path.read_bytes()
    original_hash = sha256(original).hexdigest()
    bundle_path = directory / (identity + '.json')
    bundle = json.loads(bundle_path.read_text())
    expanded = build(bundle['files'], catalog['revision'], original_hash)
    notebook_path.write_bytes(expanded)
    item.update(notebookSha256=sha256(expanded).hexdigest(), presentation=VERSION,
                upstreamNotebookSha256=original_hash)
    bundle['notebookSha256'] = item['notebookSha256']
    bundle_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + '\n')
    item['bundleSha256'] = sha256(bundle_path.read_bytes()).hexdigest()
    for path in (directory / 'catalog.json', directory.parent.parent / 'src/data/notebook-catalog.json'):
        path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    from pathlib import Path
    import sys
    directory = Path(sys.argv[1])
    apply(directory, json.loads((directory / 'catalog.json').read_text()))
