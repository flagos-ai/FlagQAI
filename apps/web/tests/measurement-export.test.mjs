import test from "node:test";
import assert from "node:assert/strict";
import { jobMeasurementCSV, jobCSV } from "../src/state/exports.ts";
test("zero-shot exports retain counts without inventing probabilities or NaN", () => {
  const job = {
    result: {
      counts: { "00": 0 },
      shots: 0,
      registers: [],
      decoded: undefined,
    },
    experiment: {
      measurements: [
        { batches: [[{ state: "00", key_type: "string", count: 0 }]] },
      ],
    },
  };
  assert.equal(jobMeasurementCSV(job), "state,count,probability\n00,0,");
  assert.equal(
    jobCSV({ ...job, experiment: undefined }),
    "state,count,probability\n00,0,",
  );
  for (const shots of [NaN, Infinity, -1])
    assert.equal(
      jobCSV({ ...job, result: { ...job.result, shots } }),
      "state,count,probability\n00,0,",
    );
});
test("measurement CSV uses selected batch counts rather than stale decoded rows", () => {
  const job = {
    result: {
      counts: { "00": 10 },
      shots: 10,
      registers: [{ name: "old", wires: [0] }],
      decoded: [{ state: "00", count: 10, values: { old: 0 } }],
    },
    experiment: {
      measurements: [
        {
          batches: [
            [{ state: "00", key_type: "string", count: 10 }],
            [
              { state: "11", key_type: "string", count: 3 },
              { state: "10", key_type: "string", count: 1 },
            ],
          ],
        },
        { batches: [[{ state: "2", key_type: "integer", count: 4 }]] },
      ],
    },
  };
  const before = JSON.stringify(job);
  assert.equal(
    jobMeasurementCSV(job, 0, 1),
    "state,count,probability\n10,1,0.25\n11,3,0.75",
  );
  assert.equal(
    jobMeasurementCSV(job, 1, 0),
    "state,count,probability\n2 (integer),4,1",
  );
  assert.equal(JSON.stringify(job), before);
  assert.equal(
    jobMeasurementCSV({ ...job, experiment: undefined }),
    jobCSV({ ...job, experiment: undefined }),
  );
});
