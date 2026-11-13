import test from "node:test";
import assert from "node:assert/strict";
import {
  researchComparison,
  savedResearchResult,
  researchNumber,
} from "../src/state/research-result.ts";
const a = {
  method: "maxcut-saved-measurements.v1",
  execution_status: "completed",
  problem: { sha256: "same" },
  metrics: [
    {
      key: "objective",
      label: "Expected cut",
      value: 4,
      unit: "cut weight",
      direction: "maximize",
      method: "exact",
    },
  ],
  resources: [
    { key: "gates", value: 20, unit: "gates", scope: "circuit" },
    { key: "run_seconds", value: 2, unit: "s", scope: "whole Python run" },
  ],
};
test("metric change and relative improvement keep cost and run totals separate", () => {
  const b = structuredClone(a);
  b.metrics[0].value = 4.8;
  b.resources[0].value = 30;
  const r = researchComparison(a, b);
  assert.equal(r.warning, null);
  assert.ok(Math.abs(r.metrics[0].relative - 0.2) < 1e-10);
  assert.ok(r.metrics[0].improvement > 0);
  assert.equal(r.resources[0].delta, 10);
  assert.equal(r.resources[1].delta, null);
  const regress = structuredClone(a);
  regress.metrics[0].value = 3;
  assert.equal(researchComparison(a, regress).metrics[0].improvement, -1);
});
test("problem, method, failed execution and units never imply a false improvement", () => {
  for (const mutate of [
    (b) => (b.problem.sha256 = "other"),
    (b) => (b.method = "other"),
    (b) => (b.execution_status = "failed"),
    (b) => (b.metrics[0].unit = "Ha"),
    (b) => (b.metrics[0].method = "sampled"),
  ]) {
    const b = structuredClone(a);
    mutate(b);
    assert.equal(researchComparison(a, b).metrics[0].delta, null);
  }
  const zero = structuredClone(a);
  zero.metrics[0].value = 0;
  assert.equal(researchComparison(zero, a).metrics[0].relative, null);
  assert.ok(researchComparison(undefined, a).warning);
  assert.equal(researchNumber(1e-10, true), "+1e-10");
});
test("stored results must belong to the exact origin and archive version", () => {
  const binding = {
    run_id: "run",
    source_sha256: "source",
    archive_sha256: "archive",
    program_hash: "program",
  };
  const result = { schema: "flagqai.research-result.v1", binding };
  const record = {
    program: {
      origin: { run_id: "run", source_hash: "source" },
      experiment: {
        sha256: "archive",
        program_hash: "program",
        python_run: { id: "run", source_hash: "source" },
        research_result: result,
      },
    },
  };
  assert.equal(savedResearchResult(record), result);
  for (const key of Object.keys(binding)) {
    const bad = structuredClone(record);
    bad.program.experiment.research_result.binding[key] = "other";
    assert.equal(savedResearchResult(bad), undefined);
  }
});
