import test from "node:test";
import assert from "node:assert/strict";
import {
  pythonHistoryLabel,
  pythonRunTime,
} from "../src/state/python-history.ts";
test("same-name runs remain distinguishable even with identical submission times", () => {
  const run = {
    id: "abcdef01-original",
    name: "main.py",
    status: "completed",
    created_at: 1793520000,
  };
  const first = pythonHistoryLabel(run);
  const second = pythonHistoryLabel({ ...run, id: "fedcba02-variant" });
  assert.notEqual(first, second);
  assert.ok(first.startsWith("main.py · "));
  assert.ok(first.endsWith("completed · abcdef01"));
  assert.ok(first.includes(pythonRunTime(run.created_at)));
});
test("legacy histories retain identity without inventing a submission date", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, 0, 1e100])
    assert.equal(pythonRunTime(value), undefined);
  assert.equal(
    pythonHistoryLabel({
      id: "12345678-old",
      name: "old.py",
      status: "timed_out",
    }),
    "old.py · timed out · 12345678",
  );
});
