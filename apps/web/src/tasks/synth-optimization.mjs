// Explicit local compilation experiment; never submits a model request.
export const synthOptimizationTaskName =
  "Synthesis · Optimization & verification";
export const synthOptimizationSource = `from collections.abc import Mapping
from dataclasses import asdict, is_dataclass, replace
from hashlib import sha256
import inspect
import json
from pathlib import Path

import torch
import flagquantum as fq
from flagquantum import synth
from flagquantum.compiler import optimize, estimate_resources

BITS = 2
OPTIMIZATION_LEVEL = 2
TOLERANCE = 1e-10

def polynomial(x: int, y: int) -> int:
    return x * x + y

def plain(value):
    if is_dataclass(value):
        return plain(asdict(value))
    if isinstance(value, Mapping):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [plain(v) for v in value]
    return value

source_hash = sha256(Path(__file__).read_bytes()).hexdigest()
digest = sha256()
sdk_root = Path(fq.__file__).resolve().parent
for path in sorted(sdk_root.rglob("*")):
    if path.is_file() and not path.is_symlink() and path.suffix in (".py", ".so", ".pyd", ".dylib"):
        digest.update(path.relative_to(sdk_root).as_posix().encode() + bytes([0]))
        digest.update(sha256(path.read_bytes()).digest())
constraints = dict(max_qubits=20, memory_limit_bytes=64*1024*1024, objective="width")
program = synth.synthesize(polynomial, inputs={"x": synth.UInt(BITS), "y": synth.UInt(BITS)},
    input_state=synth.InputState.uniform(), **constraints)
baseline_result = fq.run(program)
expected = {(x, y, x*x+y): 1/(2**BITS)**2
            for x in range(2**BITS) for y in range(2**BITS)}
names = ("x", "y", "result")

def named_outputs(result):
    # This experiment keeps the logical layout and verifies the full prepared state.
    state = result.statevector().reshape(-1)
    probabilities = state.abs().square().tolist()
    named = {}
    for index, probability in enumerate(probabilities):
        if probability <= 1e-14:
            continue
        values = []
        for name in names:
            value = 0
            for wire in program.registers[name]:
                value = (value << 1) | ((index >> (program.circuit.n_wires - 1 - wire)) & 1)
            values.append(value)
        key = tuple(values)
        named[key] = named.get(key, 0) + probability
    return named

baseline_hash = None
for label in ("baseline", "candidate"):
    result = baseline_result if label == "baseline" else fq.run(
        optimize(program.circuit, optimization_level=OPTIMIZATION_LEVEL))
    named = named_outputs(result)
    assert named.keys() == expected.keys(), "Unexpected named outputs; candidate not accepted"
    probability_error = max(abs(named[k] - expected[k]) for k in expected)
    assert probability_error <= TOLERANCE, "Classical outputs differ; candidate not accepted"
    state_error = float((result.statevector() - baseline_result.statevector()).abs().max())
    assert state_error <= TOLERANCE, "Prepared states differ; candidate not accepted"
    filename = "optimization-" + label + ".fqx"
    fq.save(filename, result.plan, result=result)
    archived = fq.load(filename)
    if label == "baseline":
        baseline_hash = archived.program.content_hash
    replay = fq.run(archived.program)
    torch.testing.assert_close(replay.statevector(), result.statevector(), atol=TOLERANCE, rtol=0)
    report = plain(program.report)
    report["resources"] = plain(estimate_resources(archived.program))
    evidence = {
        "schema": "flagqai.synthesis-evidence.v1", "label": label,
        "problem": f"x*x+y; x:uint{BITS}, y:uint{BITS}; uniform inputs",
        "source_sha256": source_hash, "program_hash": archived.program.content_hash,
        "sdk_version": fq.__version__, "sdk_code_sha256": digest.hexdigest(),
        "synthesis_module_sha256": sha256(Path(inspect.getsourcefile(synth.synthesize)).read_bytes()).hexdigest(),
        "constraints": constraints, "report": report, "register_names": list(names),
        "outcomes": [{"values": list(k), "probability": named[k]} for k in sorted(named)],
        "checks": {"expected_outcomes": len(expected), "max_probability_error": probability_error,
                   "tolerance": TOLERANCE, "saved_circuit_replay": True},
        "iteration": {"role": label, "baseline_program_hash": baseline_hash,
                      "method": "flagquantum.compiler.optimize", "optimization_level": OPTIMIZATION_LEVEL,
                      "prepared_state_max_error": state_error},
    }
    recorded = replace(result, metrics={**result.metrics, "flagqai_synthesis": evidence})
    fq.save(filename, result.plan, result=recorded, overwrite=True)
    assert fq.load(filename).result.metrics["flagqai_synthesis"] == evidence
    print(label, json.dumps({"resources": report["resources"], "checks": evidence["checks"]}))

print("Both archives replay and match all classical outputs and the full prepared state.")
print("Prepared-state verification is not a proof of unitary equivalence for arbitrary input states.")
print("A further optimization pass may leave resources unchanged. Explicit T/Tdg counts exclude undecomposed CCX costs.")
`;
