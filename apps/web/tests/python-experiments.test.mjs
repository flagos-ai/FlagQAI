import test from "node:test";
import assert from "node:assert/strict";
import { loadPythonExperiments } from "../src/api/python-experiments.ts";
import { pythonAPI } from "../src/api/python-runs.ts";

const references = ["a", "b", "c"].map((id) => ({
  id,
  sha256: id,
  filename: id + ".fqx",
  has_result: true,
}));
const run = {
  id: "run",
  source: "saved source",
  source_hash: "revision",
  experiments: references,
};
const record = (id) => ({
  id,
  program: {
    experiment: { sha256: id },
    origin: { run_id: "run", source: run.source, source_hash: run.source_hash },
  },
});

test("a failed preview and a mismatched source do not hide a valid sibling experiment; retry only reads archives", async () => {
  const first = await loadPythonExperiments(run, async (id) => {
    if (id === "a") throw Error("Preview service offline");
    if (id === "b") return { ...record(id), id: "old-file" };
    return record(id);
  });
  assert.match(first[0].error, /offline/);
  assert.match(first[1].error, /does not match/);
  assert.equal(first[2].record.id, "c");
  const retried = await loadPythonExperiments(
    { ...run, experiments: references.slice(0, 2) },
    async (id) => record(id),
  );
  assert.deepEqual(
    retried.map((item) => item.record.id),
    ["a", "b"],
  );
});

test("recollection uses the existing run without resubmitting source or creating a new run", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => run };
  };
  try {
    assert.deepEqual(await pythonAPI.collect("run"), run);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/python/runs/run/collect");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.body, "{}");
  } finally {
    globalThis.fetch = previous;
  }
});
