import test from "node:test";
import assert from "node:assert/strict";
import { experimentTaskStatus } from "../src/state/experiment-task-status.ts";
const run = (id, status = "completed", extra = {}) => ({
  id,
  status,
  collection_status: "completed",
  collection_errors: [],
  experiments: status === "completed" ? [{ id, has_result: true }] : [],
  ...extra,
});
const status = (runs, extra = {}) =>
  experimentTaskStatus({
    runs,
    expectedRuns: runs.length,
    active: false,
    outcome: "completed",
    unavailable: false,
    savedResults: runs.filter((r) => r.experiments.some((e) => e.has_result))
      .length,
    ...extra,
  });
test("completed task with a later complete saved result retains earlier failures as history", () => {
  const s = status([
    run("first", "failed"),
    run("second", "timed_out"),
    run("final"),
  ]);
  assert.equal(s.label, "Experiment ready");
  assert.equal(s.recovered, true);
  assert.equal(s.settled, true);
  assert.equal(s.needsAttention, false);
  assert.deepEqual(
    s.problems.map((r) => r.id),
    ["first", "second"],
  );
});
test("a newer failed or cancelled run cannot be hidden by earlier results", () => {
  for (const terminal of ["failed", "cancelled", "timed_out"]) {
    const s = status([run("old"), run("latest", terminal)]);
    assert.equal(s.recovered, false);
    assert.equal(s.needsAttention, true);
    assert.equal(s.label, "Run needs attention");
    assert.equal(s.settled, false);
  }
});
test("active retries and ongoing collection describe current work rather than historical failure", () => {
  const old = run("old", "failed");
  assert.equal(
    status([old, run("retry", "running", { collection_status: "pending" })], {
      active: true,
    }).label,
    "Running experiment",
  );
  const s = status([
    old,
    run("retry", "completed", { collection_status: "collecting" }),
  ]);
  assert.equal(s.label, "Collecting saved results");
  assert.equal(s.recovered, false);
});
test("missing or stale run facts cannot establish recovery", () => {
  const runs = [run("old", "failed"), run("latest")];
  for (const extra of [{ expectedRuns: 3 }, { unavailable: true }]) {
    const s = status(runs, extra);
    assert.equal(s.recovered, false);
    assert.equal(s.settled, false);
    assert.equal(s.label, "Checking run progress");
  }
});
test("only earlier collection problems can become history after a clean later run", () => {
  const partial = run("partial", "completed", {
    collection_status: "partial",
    collection_errors: [{ message: "bad archive" }],
  });
  const earlier = status([partial, run("later")]);
  assert.equal(earlier.recovered, true);
  assert.deepEqual(
    earlier.problems.map((r) => r.id),
    ["partial"],
  );
  const latest = status([run("earlier"), partial]);
  assert.equal(latest.recovered, false);
  assert.equal(latest.needsAttention, true);
});
test("success without a saved result cannot mask previous failure", () => {
  const s = status([
    run("old", "failed"),
    run("empty", "completed", { experiments: [] }),
  ]);
  assert.equal(s.recovered, false);
  assert.equal(s.label, "Run needs attention");
});
test("Agent completion is required before declaring a recovered task ready", () => {
  const runs = [run("old", "failed"), run("retry")];
  for (const outcome of [undefined, "error", "cancelled"]) {
    const s = status(runs, { outcome });
    assert.equal(s.recovered, false);
    assert.equal(s.needsAttention, true);
  }
  assert.equal(status(runs, { active: true }).label, "Agent working");
});
test("clean first-attempt and interrupted tasks preserve their original result states", () => {
  assert.equal(status([run("ok")]).label, "Experiment ready");
  assert.equal(
    status([run("ok")], { outcome: "error" }).label,
    "Results saved",
  );
  assert.equal(status([]).label, "No saved result yet");
});

test("unknown collection status does not turn completed execution into ready results", () => {
  const s = status([
    run("latest", "completed", { collection_status: undefined }),
  ]);
  assert.equal(s.label, "Checking run progress");
  assert.equal(s.settled, false);
});
