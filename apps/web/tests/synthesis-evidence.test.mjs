import test from "node:test";
import assert from "node:assert/strict";
import {
  synthesisEvidence,
  programSynthesis,
  compareSynthesis,
  synthesisModules,
} from "../src/state/synthesis-evidence.ts";
const hash = "a".repeat(64),
  source = "b".repeat(64);
function fixture() {
  return {
    program_hash: hash,
    has_result: true,
    metrics: {
      flagqai_synthesis: {
        schema: "flagqai.synthesis-evidence.v1",
        label: "baseline",
        problem: "x+1",
        sdk_version: "0.4.0",
        sdk_code_sha256: "e".repeat(64),
        synthesis_module_sha256: "c".repeat(64),
        program_hash: hash,
        source_sha256: source,
        constraints: { max_qubits: 16 },
        report: {
          resources: {
            n_qubits: 2,
            n_operations: 1,
            depth: 1,
            t_count: 0,
            basis: "static_instruction_sequence",
          },
          workspace_qubits: 0,
          candidate: "retain",
          register_widths: { x: 1, result: 2 },
        },
        register_names: ["x", "result"],
        outcomes: [
          { values: [0, 1], probability: 0.5 },
          { values: [1, 2], probability: 0.5 },
        ],
        checks: {
          expected_outcomes: 2,
          max_probability_error: 0,
          tolerance: 1e-10,
          saved_circuit_replay: true,
        },
      },
    },
  };
}
test("recorded report requires matching source, circuit and valid named distribution", () => {
  const info = fixture();
  assert.ok(synthesisEvidence(info, source));
  assert.equal(synthesisEvidence(info, hash), null);
  for (const mutate of [
    (e) => (e.program_hash = "f".repeat(64)),
    (e) => (e.outcomes[0].probability = NaN),
    (e) => (e.outcomes[0].values = [2, 1]),
    (e) => (e.outcomes[0].probability = 0.8),
    (e) => (e.outcomes[1].values = [0, 1]),
    (e) => (e.checks.tolerance = 1),
    (e) => (e.register_names = ["x", "x"]),
  ]) {
    const f = fixture();
    mutate(f.metrics.flagqai_synthesis);
    assert.equal(synthesisEvidence(f, source), null);
  }
  assert.equal(
    programSynthesis({
      experiment: info,
      origin: { source_hash: source },
      compiled: { qubits: 2, depth: 1, instructions: [{ name: "h" }] },
    })?.label,
    "baseline",
  );
  assert.equal(
    programSynthesis({
      experiment: info,
      origin: { source_hash: source },
      compiled: { qubits: 3, depth: 1, instructions: [{ name: "h" }] },
    }),
    null,
  );
});
test("run records require the source, completion and measured SDK identity when available", () => {
  const info = fixture();
  info.python_run = {
    source_hash: source,
    execution_status: "completed",
    sdk_code_sha256: "e".repeat(64),
  };
  assert.ok(synthesisEvidence(info));
  assert.equal(
    synthesisEvidence({
      ...info,
      python_run: { ...info.python_run, execution_status: "failed" },
    }),
    null,
  );
  assert.equal(
    synthesisEvidence({
      ...info,
      python_run: { ...info.python_run, source_hash: hash },
    }),
    null,
  );
  assert.equal(
    synthesisEvidence({
      ...info,
      python_run: { ...info.python_run, sdk_code_sha256: hash },
    }),
    null,
  );
  assert.equal(synthesisEvidence({ ...info, has_result: false }), null);
});

test("constraint comparisons report tradeoffs and reject incompatible SDKs or outputs", () => {
  const a = synthesisEvidence(fixture()),
    b = structuredClone(a);
  b.constraints.topology = "line";
  b.report.resources.n_operations = 4;
  b.outcomes.reverse();
  assert.equal(compareSynthesis(a, b).operations, 3);
  assert.equal(compareSynthesis(a, b).max_probability_difference, 0);
  b.synthesis_module_sha256 = "d".repeat(64);
  assert.equal(compareSynthesis(a, b), null);
  b.synthesis_module_sha256 = a.synthesis_module_sha256;
  b.sdk_code_sha256 = "f".repeat(64);
  assert.equal(compareSynthesis(a, b), null);
  b.sdk_code_sha256 = a.sdk_code_sha256;
  b.problem = "different";
  assert.equal(compareSynthesis(a, b), null);
});

test("operation cost attribution counts fused and unmapped gates exactly once", () => {
  const rows = synthesisModules({
    synthesis_sources: [
      {
        id: "m",
        label: "Multiply",
        operation: "qint.multiply",
        action: "compute",
      },
      { id: "a", label: "Add", operation: "qint.add", action: "uncompute" },
    ],
    instructions: [
      { wires: [0, 1], source_ids: ["m"] },
      { wires: [1, 2], source_ids: ["m"] },
      { wires: [2], source_ids: ["m", "a"] },
      { wires: [3] },
    ],
  });
  assert.equal(
    rows.reduce((sum, row) => sum + row.gates, 0),
    4,
  );
  assert.deepEqual(rows[0], {
    label: "Multiply · Compute",
    gates: 2,
    wires: 3,
  });
  assert.equal(rows.at(-1).label, "Unmapped");
});
