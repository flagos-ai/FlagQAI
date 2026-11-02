import test from "node:test";
import assert from "node:assert/strict";
import { pythonRunFeedback } from "../src/state/python-feedback.ts";
import {
  defaultJobView,
  normalizeJobView,
  readJobView,
  writeJobView,
} from "../src/state/job-view.ts";

test("run feedback never presents a previous run or a stop request as confirmed completion", () => {
  const run = { id: "a", status: "running" };
  assert.equal(
    pythonRunFeedback({ selectedId: "a", run, submitting: true }).label,
    "Starting…",
  );
  assert.equal(
    pythonRunFeedback({ selectedId: "b", run }).label,
    "Loading run…",
  );
  assert.equal(
    pythonRunFeedback({ selectedId: "b", run, error: "offline" }).label,
    "Output unavailable",
  );
  assert.equal(
    pythonRunFeedback({ selectedId: "a", run, stopping: true }).label,
    "Stopping…",
  );
  assert.equal(
    pythonRunFeedback({
      selectedId: "a",
      run: { ...run, status: "cancelled" },
      stopping: true,
    }).label,
    "Stopped",
  );
  assert.equal(
    pythonRunFeedback({
      selectedId: "a",
      run: { ...run, status: "completed", collection_status: "collecting" },
    }).label,
    "Collecting results…",
  );
  assert.equal(
    pythonRunFeedback({
      selectedId: "a",
      run: { ...run, status: "completed", collection_status: "partial" },
    }).label,
    "Results need attention",
  );
  assert.match(
    pythonRunFeedback({ selectedId: "a", run: { ...run, status: "completed" } })
      .message,
    /without console output/,
  );
  assert.equal(pythonRunFeedback({}).label, "Ready");
});
test("Jobs view preferences survive remounts, stay scoped by result and clamp stale indices", () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) || null,
      setItem: (k, v) => values.set(k, v),
    };
  const job = {
    id: "a",
    experiment: {
      measurements: [
        {
          batches: [
            [...Array(65)].map((_, i) => ({ state: String(i), count: 1 })),
          ],
        },
      ],
    },
  };
  const view = {
    counts: true,
    view: "table",
    sort: "state",
    page: 2,
    measurement: 0,
    batch: 0,
    query: "010",
  };
  writeJobView(storage, job, view);
  assert.deepEqual(readJobView(storage, job), view);
  assert.deepEqual(
    readJobView(storage, { ...job, id: "other" }),
    defaultJobView,
  );
  const clamped = normalizeJobView(
    { ...view, measurement: 99, batch: 90, page: 50 },
    job,
  );
  assert.deepEqual(clamped, view);
  assert.deepEqual(
    normalizeJobView(
      {
        page: NaN,
        measurement: -1,
        batch: 1.5,
        counts: "true",
        view: "invalid",
      },
      job,
    ),
    defaultJobView,
  );
  const fewer = {
    ...job,
    experiment: { measurements: [{ batches: [[{ state: "0", count: 1 }]] }] },
  };
  assert.equal(readJobView(storage, fewer).page, 0);
  for (let i = 0; i < 90; i++)
    writeJobView(storage, { ...job, id: "run-" + i }, view);
  assert.equal(
    Object.keys(JSON.parse(values.get("fq-job-views-v1"))).length,
    64,
  );
});
test("read outages keep active runs uncertain without hiding confirmed terminal states", () => {
  const run = { id: "a", status: "running" };
  const feedback = pythonRunFeedback({
    selectedId: "a",
    run,
    updatesInterrupted: true,
  });
  assert.equal(feedback.label, "Reconnecting…");
  assert.match(feedback.message, /existing run/);
  assert.match(
    pythonRunFeedback({
      selectedId: "a",
      run,
      updatesInterrupted: true,
      stopping: true,
    }).message,
    /confirm this run/,
  );
  assert.equal(
    pythonRunFeedback({
      selectedId: "a",
      run: { ...run, status: "completed", collection_status: "pending" },
      updatesInterrupted: true,
    }).label,
    "Reconnecting…",
  );
  assert.equal(
    pythonRunFeedback({
      selectedId: "a",
      run: { ...run, status: "failed", collection_status: "pending" },
      updatesInterrupted: true,
    }).label,
    "Failed",
  );
  assert.equal(
    pythonRunFeedback({ run, updatesInterrupted: true }).label,
    "Ready",
  );
  assert.equal(
    pythonRunFeedback({
      selectedId: "a",
      run: {
        ...run,
        execution_status: "completed",
        collection_status: "collecting",
      },
    }).label,
    "Collecting results…",
  );
  assert.match(
    pythonRunFeedback({
      selectedId: "a",
      run: {
        ...run,
        execution_status: "failed",
        collection_status: "collecting",
      },
    }).message,
    /exited with an error/,
  );
});
test("state searches migrate from old preferences and reject invalid saved values", () => {
  const job = { id: "a", result: { counts: { "00": 2 } } };
  assert.equal(normalizeJobView({}, job).query, "");
  assert.equal(normalizeJobView({ query: { bad: true } }, job).query, "");
  assert.equal(
    normalizeJobView({ query: "x".repeat(1000) }, job).query.length,
    128,
  );
});
test("corrupt or unavailable view storage cannot affect the result or editor data", () => {
  const job = { id: "a", result: { counts: { "00": 3 } } };
  const bad = {
    getItem() {
      return "not JSON";
    },
    setItem() {
      throw Error("denied");
    },
  };
  assert.deepEqual(readJobView(bad, job), defaultJobView);
  assert.doesNotThrow(() => writeJobView(bad, job, defaultJobView));
  assert.equal(job.result.counts["00"], 3);
});
