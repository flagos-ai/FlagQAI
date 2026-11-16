export const synthValidationTaskName =
  "Synthesis · Constraint comparison & verification";
export const synthValidationSource = `from collections.abc import Mapping
from dataclasses import asdict, is_dataclass, replace
from hashlib import sha256
import inspect
import json
from pathlib import Path

import flagquantum as fq
from flagquantum.synth import InputState, UInt, synthesize

# Change constraints here and synthesize again; fq.run(program) uses its bound plan.
MAX_QUBITS = 16
MEMORY_LIMIT_BYTES = 64 * 1024 * 1024
TOLERANCE = 1e-10


def polynomial(x: int, y: int) -> int:
    return x * x + y


def plain(value):
    if is_dataclass(value):
        return plain(asdict(value))
    if isinstance(value, Mapping):
        return {str(key): plain(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [plain(item) for item in value]
    return value


source_sha256 = sha256(Path(__file__).read_bytes()).hexdigest()
# Match the workbench runtime fingerprint; version strings can identify different builds.
sdk_root = Path(fq.__file__).resolve().parent
sdk_digest = sha256()
for path in sorted(sdk_root.rglob("*")):
    if not path.is_file() or path.is_symlink() or path.suffix not in (".py", ".so", ".pyd", ".dylib"):
        continue
    sdk_digest.update(path.relative_to(sdk_root).as_posix().encode() + bytes([0]))
    sdk_digest.update(sha256(path.read_bytes()).digest())
sdk_code_sha256 = sdk_digest.hexdigest()
expected = {(x, y, x*x+y): 1/8 for x in range(2) for y in range(4)}
for label, objective, topology in [("baseline", "width", None), ("line", "depth", "line")]:
    constraints = dict(max_qubits=MAX_QUBITS, objective=objective, topology=topology,
                       memory_limit_bytes=MEMORY_LIMIT_BYTES)
    program = synthesize(
        polynomial, inputs={"x": UInt(1), "y": UInt(2)},
        input_state=InputState.uniform(), **constraints,
    )
    result = fq.run(program)
    named = dict(program.probabilities(result, registers=("x", "y", "result")))
    assert named.keys() == expected.keys(), "Unexpected named outputs"
    max_error = max(abs(named[key] - expected[key]) for key in expected)
    assert max_error <= TOLERANCE, "Arithmetic or probability check failed"
    filename = "synth-" + label + ".fqx"
    fq.save(filename, result.plan, result=result)
    archived = fq.load(filename)
    replay = fq.run(archived.program)
    # Replay the saved executable circuit, not the high-level compiler search.
    import torch
    torch.testing.assert_close(replay.statevector(), result.statevector(), atol=TOLERANCE, rtol=0)
    evidence = {
        "schema": "flagqai.synthesis-evidence.v1", "label": label,
        "problem": "x*x+y; x:uint1, y:uint2; uniform inputs",
        "source_sha256": source_sha256, "program_hash": archived.program.content_hash,
        "sdk_version": fq.__version__, "sdk_code_sha256": sdk_code_sha256,
        "synthesis_module_sha256": sha256(Path(inspect.getsourcefile(synthesize)).read_bytes()).hexdigest(),
        "constraints": constraints, "report": plain(program.report),
        "register_names": ["x", "y", "result"],
        "outcomes": [{"values": list(key), "probability": named[key]} for key in sorted(named)],
        "checks": {"expected_outcomes": len(expected), "max_probability_error": max_error,
                   "tolerance": TOLERANCE, "saved_circuit_replay": True},
    }
    # Namespaced report metadata uses the public FQX result API.
    recorded = replace(result, metrics={**result.metrics, "flagqai_synthesis": evidence})
    fq.save(filename, result.plan, result=recorded, overwrite=True)
    loaded = fq.load(filename)
    assert loaded.result.metrics["flagqai_synthesis"] == evidence
    print(label, json.dumps({"resources": evidence["report"]["resources"], "checks": evidence["checks"]}))

print("Both constraint variants match all 8 classical outputs and replay their saved circuits.")
print("Line routing is a hardware constraint tradeoff, not an optimization improvement claim.")
print("T counts include explicit T/Tdg gates only; undecomposed CCX costs are not Clifford+T costs.")
`;
