"""Development-only: execute the trusted built-in SDK examples, never web input.

Generate input with export-gate-examples.mjs. Run with a FlagQuantum Python
installation. This script is not imported by the local service or browser.
"""
import argparse
import contextlib
import datetime
import io
import json
from pathlib import Path

import flagquantum as fq
import torch

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--input", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
args = parser.parse_args()
torch.set_num_threads(2)
# Confirm basis labels match the workspace: q0 is the leftmost displayed bit.
probe = fq.run(fq.Circuit(2).x(0)).statevector().reshape(-1)
assert int(probe.abs().argmax()) == 2, "Unexpected SDK basis order"
def state_rows(state, qubits):
    assert state.device.type == "cpu", "Snapshots must be computed on CPU"
    state = state.detach().reshape(-1)
    assert len(state) == 2 ** qubits
    assert torch.isfinite(state).all()
    assert abs(float(state.abs().square().sum()) - 1) < 1e-5
    return [{"state": format(index, f"0{qubits}b"),
             "real": float(value.real), "imag": float(value.imag),
             "probability": float(value.abs().square())}
            for index, value in enumerate(state)]

records = {}
for example in json.loads(args.input.read_text()):
    # The built-in source explicitly marks the operation boundary. Everything
    # before it is initialization and demonstration input preparation only.
    marker = "# Measure q0" if example["name"] == "measure" else "# Apply "
    assert example["source"].count(marker) == 1
    prepared = {}
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(example["source"].split(marker)[0], "<prepared input>", "exec"), prepared)
    before = state_rows(fq.run(prepared["circuit"]).statevector(), example["qubits"])
    scope = {}
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(example["source"], "<built-in example>", "exec"), scope)
    result = scope["result"]
    record = {"source": example["source"], "qubits": example["qubits"], "before": before}
    if example["name"] == "measure":
        counts = {str(key): int(value) for key, value in result.counts[0].items()}
        assert sum(counts.values()) == 1024
        record.update(kind="counts", counts=counts, shots=1024, seed=42)
    else:
        record.update(kind="statevector", amplitudes=state_rows(result.statevector(), example["qubits"]))
    records[example["name"]] = record
assert len(records) == 37
payload = {"schemaVersion": 2, "comparisonPoint": "after_preparation_before_gate", "sdkVersion": fq.__version__,
           "torchVersion": torch.__version__, "device": "cpu",
           "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "bitOrder": "q0_first", "examples": records}
args.output.write_text(json.dumps(payload, indent=2) + "\n")
print(f"Saved {len(records)} verified precomputed results to {args.output}")
