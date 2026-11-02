import test from "node:test";
import assert from "node:assert/strict";
import {
  iterationPrefix,
  iterationPrompt,
  iterationFromSource,
  validateIteration,
  compareQaoaVersions,
} from "../src/state/qaoa-iteration.ts";
const hash = "a".repeat(64),
  sha = "b".repeat(64);
const ref = {
  version: 1,
  run: "run-1",
  source: hash,
  archive: "fqx-1",
  sha256: sha,
  layers: 2,
  shots: 4096,
  seed: 42,
};
const baseline = {
  sourceHash: hash,
  graph: "graph",
  optimized: { expected: 5.8, hit: 0.4, shots: 4096, seed: 42 },
  device: "cpu",
  backend: "pytorch",
  records: [
    {},
    {
      id: "fqx-1",
      program: {
        experiment: { id: "fqx-1", sha256: sha, producer_version: "0.4" },
      },
    },
  ],
};
test("iteration request pins immutable baseline and parameters without sending or copying live drafts", () => {
  const prompt = iterationPrompt({ id: "run-1" }, baseline, 2, 4096, 42);
  assert.match(prompt, /separate Python model/);
  assert.match(prompt, /do not rerun the baseline/);
  const line = prompt.split("\n").find((l) => l.startsWith(iterationPrefix));
  assert.deepEqual(iterationFromSource(line + "\nprint('new code')"), ref);
  assert.match(prompt, /p=2, shots=4096, seed=42/);
});
test("invalid settings and ambiguous lineage are rejected", () => {
  for (const patch of [
    { layers: 0 },
    { layers: 9 },
    { shots: 0 },
    { shots: 1000001 },
    { seed: -1 },
    { seed: NaN },
    { source: "wrong" },
    { run: "../file" },
  ])
    assert.throws(() => validateIteration({ ...ref, ...patch }));
  const line = iterationPrefix + JSON.stringify(ref);
  assert.throws(() => iterationFromSource(line + "\n" + line));
  assert.equal(iterationFromSource("print(1)"), null);
});
function compare(expected, patch = {}) {
  const current = structuredClone(baseline);
  current.optimized.expected = expected;
  Object.assign(current, patch);
  return compareQaoaVersions(
    ref,
    { id: "run-1", source_hash: hash },
    baseline,
    { id: "run-2" },
    current,
  );
}
test("comparison reports gains, regressions and unchanged results honestly", () => {
  assert.match(compare(6).label, /Higher/);
  assert.match(compare(5).label, /Lower/);
  assert.match(compare(5.8).label, /No clear change/);
  assert.equal(compare(5).delta, 5 - 5.8);
});
test("different settings are disclosed and a different graph or baseline identity cannot be compared", () => {
  assert.ok(compare(6, { backend: "other" }).warning.length);
  assert.ok(
    compare(6, { optimized: { ...baseline.optimized, seed: 1, shots: 128 } })
      .warning.length,
  );
  assert.throws(() => compare(6, { graph: "another" }), /does not match/);
  assert.throws(
    () =>
      compareQaoaVersions(
        { ...ref, source: "c".repeat(64) },
        { id: "run-1", source_hash: hash },
        baseline,
        { id: "run-2" },
        baseline,
      ),
    /does not match/,
  );
});

test("generated iteration messages keep a compact summary and expandable full evidence", async () => {
  const { iterationQuestion } = await import("../src/state/qaoa-iteration.ts");
  const request = iterationPrompt({ id: "run-1" }, baseline, 2, 4096, 42);
  const display = iterationQuestion("Keep my prior request.\n\n" + request);
  assert.match(display.summary, /^Keep my prior request/);
  assert.match(display.summary, /p=2, 4,096 shots and seed 42/);
  assert.ok(!display.summary.includes(hash));
  assert.equal(display.details, request);
  assert.equal(iterationQuestion("An ordinary message."), null);
  assert.equal(
    iterationQuestion(
      "Iterate the saved QAOA Max-Cut experiment\n# FLAGQAI_QAOA_ITERATION=bad",
    ),
    null,
  );
});
