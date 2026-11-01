import test from "node:test";
import assert from "node:assert/strict";
import {
  jobGroups,
  jobCounts,
  distributionRows,
} from "../src/state/job-presentation.ts";

test("job history filters without modifying jobs and pins active work before dated archives", () => {
  const now = new Date(2026, 9, 31, 12);
  const jobs = [
    {
      id: "old",
      name: "Bell reference",
      status: "completed",
      experiment: {
        imported_at: new Date(2026, 9, 30, 12).getTime(),
        filename: "reference.fqx",
      },
    },
    {
      id: "new",
      name: "Bell variant",
      status: "completed",
      experiment: { imported_at: now.getTime(), filename: "variant.fqx" },
    },
    { id: "running", name: "VQE", status: "running" },
    { id: "error", name: "Bad input", status: "failed" },
  ];
  const groups = jobGroups(jobs, "", "all", now);
  assert.equal(groups[0][0], "In progress");
  assert.equal(groups[0][1][0].id, "running");
  assert.equal(groups[1][0], "Added today");
  assert.equal(groups[1][1][0].id, "new");
  assert.deepEqual(
    jobGroups(jobs, " VARIANT.FQX ", "completed", now)[0][1].map((j) => j.id),
    ["new"],
  );
  assert.equal(jobGroups(jobs, "Bell", "failed", now).length, 0);
  assert.equal(jobs[0].id, "old");
});

test("saved measurements use only the selected recorded batch, preserve typed keys and aggregate duplicates", () => {
  const job = {
    result: { counts: { stale: 123 } },
    experiment: {
      measurements: [
        {
          batches: [
            [
              { state: "1", key_type: "integer", count: 2 },
              { state: "1", key_type: "string", count: 5 },
              { state: "1", key_type: "integer", count: 3 },
            ],
            [{ state: "00", key_type: "string", count: 20 }],
          ],
        },
        { value: 0.5 },
      ],
    },
  };
  assert.deepEqual(jobCounts(job), { "1 (integer)": 5, 1: 5 });
  assert.deepEqual(jobCounts(job, 0, 1), { "00": 20 });
  assert.deepEqual(jobCounts(job, 1), {});
  assert.deepEqual(jobCounts(job, 10), {});
  assert.deepEqual(jobCounts({ result: { counts: { "00": 15 } } }), {
    "00": 15,
  });
});

test("distribution sorting retains all states and full totals beyond the first chart page", () => {
  const counts = Object.fromEntries(
    Array.from({ length: 65 }, (_, i) => [
      i.toString(2).padStart(7, "0"),
      i + 1,
    ]),
  );
  const before = JSON.stringify(counts);
  const rows = distributionRows(counts, "probability");
  assert.equal(rows.length, 65);
  assert.equal(rows[0][1], 65);
  assert.equal(rows.slice(64).length, 1);
  assert.equal(
    rows.reduce((sum, [, count]) => sum + count, 0),
    2145,
  );
  assert.equal(distributionRows(counts, "state")[0][0], "0000000");
  assert.equal(JSON.stringify(counts), before);
});
