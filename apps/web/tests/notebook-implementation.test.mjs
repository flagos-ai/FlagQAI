import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  importedSources,
  loadImplementation,
} from "../src/state/notebook-implementation.ts";
import { notebookExamples } from "../src/state/notebooks.ts";

test("imports link actual companion modules without confusing SDK or external imports", () => {
  const files = {
    "examples/task/quantum.py": "",
    "examples/task/workflow.py": "",
    "examples/task/main.py": "",
  };
  assert.deepEqual(
    importedSources(
      "from examples.task import quantum, workflow\nfrom examples.task.main import report\nimport flagquantum\n# from examples.hidden import secret",
      files,
    ),
    Object.keys(files),
  );
  assert.deepEqual(
    importedSources(
      'import numpy\nprint("from examples.task import quantum")',
      files,
    ),
    [],
  );
});

test("every pinned notebook has an implementation index bound to its companion bundle", async () => {
  const directory = new URL("../public/notebooks/", import.meta.url);
  const index = JSON.parse(
    await readFile(new URL("implementation-index.json", directory), "utf8"),
  );
  assert.equal(Object.keys(index.entries).length, 212);
  for (const item of notebookExamples) {
    const bytes = await readFile(new URL(item.id + ".json", directory));
    const hash = Buffer.from(
      await webcrypto.subtle.digest("SHA-256", bytes),
    ).toString("hex");
    assert.equal(hash, item.bundleSha256);
    assert.equal(index.entries[item.id].bundleSha256, hash);
    const bundle = JSON.parse(bytes);
    for (const [path, calls] of Object.entries(index.entries[item.id].files)) {
      assert.equal(typeof bundle.files[path], "string");
      for (const call of calls) {
        assert.ok(call.api.startsWith("flagquantum."));
        assert.ok(
          call.line > 0 && call.line <= bundle.files[path].split("\n").length,
        );
      }
    }
  }
});

test("implementation loading refuses mismatched sources before displaying code", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}"));
  await assert.rejects(
    loadImplementation(notebookExamples[0]),
    /pinned revision/,
  );
});
