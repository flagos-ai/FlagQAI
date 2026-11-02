import test from "node:test";
import assert from "node:assert/strict";
import {
  pythonActivityFeedback,
  pythonActivityUpdating,
} from "../src/state/python-activity.ts";

test("Python activity follows collection after process exit, but stops at terminal states", () => {
  for (const status of ["queued", "running"])
    assert.equal(pythonActivityUpdating({ status }), true);
  for (const collection_status of ["pending", "collecting"]) {
    const run = { id: "a", status: "completed", collection_status };
    assert.equal(pythonActivityUpdating(run), true);
    assert.equal(pythonActivityFeedback(run).busy, true);
  }
  for (const collection_status of [
    "completed",
    "partial",
    "failed",
    "cancelled",
    undefined,
  ])
    assert.equal(
      pythonActivityUpdating({ status: "completed", collection_status }),
      false,
    );
  for (const status of ["failed", "timed_out", "cancelled"])
    assert.equal(
      pythonActivityUpdating({ status, collection_status: "pending" }),
      false,
    );
});

test("Python activity separates usable outputs, missing experiments and incomplete collection", () => {
  const run = {
    id: "a",
    status: "completed",
    collection_status: "completed",
    experiments: [],
  };
  assert.equal(pythonActivityFeedback(run).label, "No saved experiment");
  assert.equal(
    pythonActivityFeedback({
      ...run,
      experiments: [{ id: "one", has_result: false }],
    }).label,
    "Circuit ready",
  );
  assert.equal(
    pythonActivityFeedback({
      ...run,
      experiments: [{ id: "one", has_result: true }],
    }).label,
    "Results ready",
  );
  assert.equal(
    pythonActivityFeedback({ ...run, artifact: { job: { id: "result" } } })
      .label,
    "Results ready",
  );
  for (const collection_status of ["partial", "failed", "cancelled"])
    assert.equal(
      pythonActivityFeedback({ ...run, collection_status }).label,
      "Results need attention",
    );
  assert.equal(
    pythonActivityFeedback({
      ...run,
      collection_errors: [{ filename: "bad.fqx", message: "Corrupt archive" }],
    }).label,
    "Results need attention",
  );
  assert.equal(
    pythonActivityFeedback({ ...run, collection_status: undefined }).label,
    "Python finished",
  );
  assert.equal(
    pythonActivityFeedback({ ...run, status: "failed" }).label,
    "Failed",
  );
});
