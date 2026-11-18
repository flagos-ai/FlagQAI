import test from "node:test";
import assert from "node:assert/strict";
import {
  researchDeliveries,
  researchDelivery,
  continueResearchPrompt,
} from "../src/state/research-delivery.ts";
const id = "invsqrt-" + "a".repeat(32);
const other = "invsqrt-" + "b".repeat(32);
const action = (seq, target, extra = {}) => ({
  seq,
  operation: "research.present",
  status: "completed",
  origin: "agent",
  result: { research_run: { id: target } },
  ...extra,
});
function run() {
  return {
    id,
    status: "completed",
    source_sha256: "f".repeat(64),
    comparison: {
      columns: ["Baseline", "Candidate"],
      rows: [
        { label: "Validation", values: ["PASS", "PASS"] },
        { label: "Resource cost · lower is better", values: [200, 180] },
      ],
    },
  };
}
test("research cards require confirmed turn actions and prefer the latest presentation without losing earlier references", () => {
  assert.deepEqual(
    researchDeliveries([
      action(7, id),
      action(1, id),
      action(6, other),
      action(8, other, { status: "failed" }),
      action(9, other, { origin: "ui" }),
      action(10, "fabricated"),
      action(11, other, { operation: "python.run" }),
    ]),
    [other, id],
  );
  assert.deepEqual(
    researchDeliveries([
      { seq: 1, status: "completed", text: "PASS cost 1", result: {} },
    ]),
    [],
  );
});
test("delivery conclusions use saved verifier status and measured cost, never Agent prose or pending results", () => {
  assert.equal(researchDelivery(run()).label, "Verified · lower resource cost");
  assert.equal(researchDelivery(run()).delta, -20);
  const worse = run();
  worse.comparison.rows[1].values[1] = 220;
  assert.equal(
    researchDelivery(worse).label,
    "Verified · higher resource cost",
  );
  assert.equal(researchDelivery(worse).delta, 20);
  for (const status of ["review", "running", "failed", "interrupted"]) {
    const outcome = researchDelivery({ ...run(), status });
    assert.equal(outcome.passed, false);
    assert.equal(outcome.delta, null);
  }
  assert.equal(
    researchDelivery({ ...run(), source_sha256: undefined }).passed,
    false,
  );
  assert.throws(
    () =>
      continueResearchPrompt({ ...run(), source_sha256: "invalid" }, "goal"),
    /version is unavailable/,
  );
  const missing = run();
  missing.comparison.columns = ["Baseline"];
  assert.equal(researchDelivery(missing).passed, false);
});
test("continue requests bind the saved source and retain failed evidence without automatically executing or adopting", () => {
  const text = continueResearchPrompt(
    { ...run(), error: "Original parser failure" },
    "Reduce cost within the error budget",
  );
  assert.ok(text.includes(id));
  assert.ok(text.includes("f".repeat(64)));
  assert.ok(text.includes("Original parser failure"));
  assert.ok(text.includes("do not verify or adopt automatically"));
  assert.ok(text.includes("current project baseline"));
});

test("archived comparisons require both validation results and distinguish unchanged costs", () => {
  const unchanged = run();
  unchanged.comparison.rows[1].values[1] = 200;
  assert.equal(
    researchDelivery(unchanged).label,
    "Verified · unchanged resource cost",
  );
  const missing = run();
  missing.comparison.columns = ["Candidate"];
  assert.equal(researchDelivery(missing).passed, false);
  const failed = run();
  failed.comparison.rows[0].values[0] = "FAIL";
  assert.equal(researchDelivery(failed).passed, false);
  const nonfinite = run();
  nonfinite.comparison.rows[1].values[1] = Infinity;
  assert.equal(researchDelivery(nonfinite).delta, null);
  for (const status of ["review", "running"])
    assert.throws(
      () => continueResearchPrompt({ ...run(), status }, "goal"),
      /terminal research record/,
    );
  assert.throws(
    () => continueResearchPrompt({ ...run(), id: "invented" }, "goal"),
    /terminal research record/,
  );
});
