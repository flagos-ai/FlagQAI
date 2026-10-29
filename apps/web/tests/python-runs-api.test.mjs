import test from "node:test";
import assert from "node:assert/strict";
import { pythonAPI } from "../src/api/python-runs.ts";

test("a lost submission is not silently retried or misreported as a Python failure", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("Failed to fetch");
  };
  try {
    await assert.rejects(
      pythonAPI.run("print(42)", "acceptance"),
      /status is unknown.*check run history.*draft is retained/,
    );
    assert.equal(calls, 1);
    await assert.rejects(
      pythonAPI.read("run-id"),
      /Cannot connect.*output and draft are retained/,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      pythonAPI.read("run-id", controller.signal),
      /Failed to fetch/,
    );
  } finally {
    globalThis.fetch = previous;
  }
});
