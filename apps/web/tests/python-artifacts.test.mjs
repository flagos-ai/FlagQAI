import assert from "node:assert/strict";
import test from "node:test";
import {
  pythonExample,
  matchesPythonExperiment,
  migrateLegacyPythonExample,
} from "../src/state/python-workspace.ts";
import { workspaceReducer } from "../src/state/reducer.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";
const run = { id: "new-run", source: "circuit.x(1)", source_hash: "new-hash" };
const reference = { id: "fqx-" + "a".repeat(32), sha256: "file-hash" };
const record = {
  id: reference.id,
  program: {
    id: reference.id,
    name: "bell",
    source: "QASM export",
    created: 1,
    compiled: { instructions: [] },
    experiment: { sha256: reference.sha256 },
    origin: {
      language: "python",
      source: run.source,
      source_hash: run.source_hash,
      run_id: run.id,
    },
  },
};
test("Python artifact navigation requires matching file identity, run ID and frozen source", () => {
  assert.equal(matchesPythonExperiment(run, reference, record), true);
  for (const changes of [
    { run_id: "old-run" },
    { source: "old source" },
    { source_hash: "old-hash" },
  ])
    assert.equal(
      matchesPythonExperiment(run, reference, {
        ...record,
        program: {
          ...record.program,
          origin: { ...record.program.origin, ...changes },
        },
      }),
      false,
    );
  assert.equal(
    matchesPythonExperiment(run, { ...reference, id: "other-file" }, record),
    false,
  );
  assert.equal(
    matchesPythonExperiment(
      run,
      { ...reference, sha256: "other-bytes" },
      record,
    ),
    false,
  );
});
test("a saved Python experiment never replaces newer editor edits", () => {
  const current = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    source: "new unsaved draft",
    language: "python",
    undo: ["previous draft"],
  };
  const next = workspaceReducer(current, {
    type: "import-experiment",
    record,
    open: true,
  });
  assert.equal(next.source, current.source);
  assert.deepEqual(next.undo, current.undo);
  assert.equal(next.programs[0].origin.source, run.source);
});
test("the built-in Python example uses official save/load, not the injected Web helper", () => {
  assert.match(
    pythonExample,
    /fq\.save\("bell\.fqx", result\.plan, result=result\)/,
  );
  assert.doesNotMatch(pythonExample, /flagquantum_web|publish\(/);
});

test("legacy examples migrate all saved locations while preserving user gates and recovery copy", () => {
  const old = `import flagquantum as fq\nfrom flagquantum_web import publish\ncircuit = fq.Circuit(2)\ncircuit.x(1)\nresult = fq.run(circuit)\npublish(circuit, result, name="Bell pair · Python")\n`;
  const saved = {
    language: "python",
    source: old,
    name: "Edited Bell",
    languageDrafts: { python: { source: old, name: "Bell", undo: [] } },
    models: [{ name: "Bell", source: old, language: "python" }],
  };
  const values = new Map([["fq-react-workspace-v1", JSON.stringify(saved)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const state = restoreWorkspace(storage, "model");
  for (const source of [
    state.source,
    state.languageDrafts.python.source,
    state.models[0].source,
  ]) {
    assert.match(source, /circuit.x\(1\)/);
    assert.match(source, /fq.save\("bell.fqx", result.plan, result=result\)/);
    assert.doesNotMatch(source, /flagquantum_web|publish\(/);
  }
  assert.equal(
    JSON.parse(values.get("fq-before-save-load-migration-v1")).source,
    old,
  );
  const lockedStorage = {
    getItem: storage.getItem,
    setItem: () => {
      throw new Error("quota");
    },
  };
  values.delete("fq-before-save-load-migration-v1");
  assert.equal(restoreWorkspace(lockedStorage, "model").source, old);
});

test("migration leaves one blank line after imports and repairs previously migrated headers", () => {
  const old =
    'import flagquantum as fq\nfrom flagquantum_web import publish\n\ncircuit = fq.Circuit(2)\nresult = fq.run(circuit)\npublish(circuit, result, name="Bell")\n';
  const migrated = migrateLegacyPythonExample(old);
  assert.ok(migrated.startsWith("import flagquantum as fq\n\ncircuit ="));
  assert.equal(
    migrateLegacyPythonExample(migrated.replace("fq\n\n", "fq\n\n\n")),
    migrated,
  );
  const custom = "import flagquantum as fq\n\n\ncircuit = fq.Circuit(2)\n";
  assert.equal(migrateLegacyPythonExample(custom), custom);
});
