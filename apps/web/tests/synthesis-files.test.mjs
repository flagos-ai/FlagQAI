import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  synthesisFiles,
  sourceTree,
  synthesisFileModel,
  loadSynthesisFile,
} from "../src/state/synthesis-files.ts";

test("every repository file retains its original snapshot hash and size", async () => {
  assert.deepEqual(
    JSON.parse(
      await readFile(
        new URL("../public/examples/synthesis-files.json", import.meta.url),
      ),
    ),
    JSON.parse(
      await readFile(
        new URL("../src/data/synthesis-files.json", import.meta.url),
      ),
    ),
  );
  assert.equal(synthesisFiles.length, 2679);
  assert.equal(new Set(synthesisFiles.map((file) => file.path)).size, 2679);
  const catalog = JSON.parse(
    await readFile(
      new URL("../public/notebooks/catalog.json", import.meta.url),
    ),
  );
  for (const file of synthesisFiles) {
    assert.ok(!file.path.split("/").includes(".."));
    const raw = await readFile(
      new URL("../public" + file.url, import.meta.url),
    );
    assert.equal(raw.length, file.bytes, file.path);
    assert.equal(
      createHash("sha256").update(raw).digest("hex"),
      file.sha256,
      file.path,
    );
    if (file.notebookId) {
      const item = catalog.entries.find((item) => item.id === file.notebookId);
      assert.equal(file.path, item.path + "/walkthrough.ipynb");
      assert.equal(file.sha256, item.notebookSha256);
    }
  }
  assert.equal(synthesisFiles.filter((file) => file.notebookId).length, 212);
  assert.equal(
    synthesisFiles.filter((file) => file.path.endsWith(".py")).length,
    1318,
  );
});

test("tree preserves exact folder names and distinct identities for duplicate filenames", () => {
  const flatten = (node) => [...node.files, ...node.folders.flatMap(flatten)];
  assert.deepEqual(
    flatten(sourceTree())
      .map((file) => file.path)
      .sort(),
    synthesisFiles.map((file) => file.path).sort(),
  );
  const found = flatten(sourceTree("cooling_systems_optimization overview"));
  assert.ok(found.length > 1);
  assert.ok(
    found.every((file) =>
      file.path.includes("cooling_systems_optimization/overview/"),
    ),
  );
  const duplicates = synthesisFiles
    .filter((file) => file.path.endsWith("/main.py"))
    .slice(0, 2);
  assert.equal(duplicates.length, 2);
  assert.notEqual(
    synthesisFileModel(duplicates[0], "first").name,
    synthesisFileModel(duplicates[1], "second").name,
  );
});

test("loading original Python never truncates large files and rejects altered content", async () => {
  const file = synthesisFiles.find(
    (file) =>
      file.path === "applications/physical_systems/hhl_lanchester/physics.py",
  );
  const raw = await readFile(new URL("../public" + file.url, import.meta.url));
  assert.ok(raw.length > 32768);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(raw);
    assert.equal(await loadSynthesisFile(file), raw.toString("utf8"));
    globalThis.fetch = async () => new Response("changed");
    await assert.rejects(
      loadSynthesisFile(file),
      /differs from the repository snapshot/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
