import test from "node:test";
import assert from "node:assert/strict";
import { savedResearchGuidance } from "../src/state/research-guidance.ts";
import { pythonExample } from "../src/state/python-workspace.ts";
import { synthesisExamples } from "../src/state/synthesis-catalog.ts";
import { scientificSource } from "../src/tasks/scientific-synthesis.mjs";
import { synthValidationSource } from "../src/tasks/synth-constraints.mjs";
import { synthOptimizationSource } from "../src/tasks/synth-optimization.mjs";

const saved = (source) => ({
  source,
  status: "completed",
  collection_status: "completed",
  experiments: [{ id: "fx1", filename: "local.fqx", has_result: true }],
});

test("guidance requires completed results and the exact saved example source", () => {
  const run = saved(pythonExample);
  assert.match(savedResearchGuidance(run).change, /remove circuit.cx/i);
  for (const patch of [
    { status: "failed" },
    { collection_status: "partial" },
    { project: { id: "other" } },
    { experiments: [] },
    { experiments: [{ has_result: false }] },
    { source: run.source + "# changed" },
  ])
    assert.equal(savedResearchGuidance({ ...run, ...patch }), undefined);
  assert.equal(
    savedResearchGuidance(
      saved("# Official FlagQuantum example: functions/qft\nprint(42)"),
    ),
    undefined,
  );
});

test("scientific grids, synthesis constraints, optimizer levels and official examples have different checks", () => {
  const qft = synthesisExamples.find(({ id }) => id === "functions/qft");
  const evolution = synthesisExamples.find(
    ({ id }) => id === "functions/hamiltonian_evolution/suzuki_trotter",
  );
  assert.match(
    savedResearchGuidance(saved(qft.source)).change,
    /allocate\(5, x\)/,
  );
  assert.match(
    savedResearchGuidance(saved(qft.source)).check,
    /phase-sensitive/,
  );
  assert.match(
    savedResearchGuidance(saved(evolution.source)).observe,
    /distinct target problem/,
  );
  assert.match(
    savedResearchGuidance(saved(scientificSource(1))).change,
    /2-bit/,
  );
  assert.match(
    savedResearchGuidance(saved(scientificSource(2))).change,
    /saved 1-bit grid/,
  );
  assert.match(
    savedResearchGuidance(saved(synthValidationSource)).check,
    /eight named outputs/,
  );
  assert.match(
    savedResearchGuidance(saved(synthOptimizationSource)).change,
    /OPTIMIZATION_LEVEL/,
  );
});
