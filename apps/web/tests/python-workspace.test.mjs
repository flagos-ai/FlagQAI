import test from "node:test";
import assert from "node:assert/strict";
import { workspaceReducer } from "../src/state/reducer.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
import { attachmentMessage } from "../src/state/agent-attachments.ts";
const initial = () => restoreWorkspace({ getItem: () => null }, "model");
test("language switching preserves independent unsaved source, shared links and undo history", () => {
  let state = {
    ...initial(),
    language: "qasm",
    source: "my unsaved QASM",
    undo: ["old QASM"],
    editorLink: {
      id: "a".repeat(32) + ".qasm",
      modelName: "Bell",
      base: "base",
      revision: "r",
      path: "file.qasm",
    },
  };
  const old = state;
  state = workspaceReducer(state, { type: "language", language: "python" });
  assert.match(state.source, /import flagquantum/);
  assert.equal(state.editorLink, undefined);
  state = workspaceReducer(state, {
    type: "edit",
    source: 'print("unsaved Python")',
  });
  state = workspaceReducer(state, { type: "language", language: "qasm" });
  assert.equal(state.source, old.source);
  assert.deepEqual(state.editorLink, old.editorLink);
  assert.deepEqual(state.undo, old.undo);
  state = workspaceReducer(state, { type: "language", language: "python" });
  assert.equal(state.source, 'print("unsaved Python")');
});
test("Python drafts survive persistence and late cross-language links cannot attach to another file", () => {
  let state = workspaceReducer(initial(), {
    type: "language",
    language: "python",
  });
  state = workspaceReducer(state, { type: "edit", source: "print(42)" });
  state = workspaceReducer(state, { type: "save" });
  assert.equal(state.models[0].language, "python");
  const data = new Map(),
    storage = {
      getItem: (key) => data.get(key) || null,
      setItem: (key, value) => data.set(key, value),
    };
  persistWorkspace(storage, state);
  const restored = restoreWorkspace(storage, "model");
  assert.equal(restored.language, "python");
  assert.equal(restored.source, "print(42)");
  const late = workspaceReducer(restored, {
    type: "link-editor",
    name: restored.name,
    expectedSource: restored.source,
    file: {
      id: "a".repeat(32) + ".qasm",
      path: "old.qasm",
      source: "old",
      revision: "r",
    },
  });
  assert.equal(late.editorLink, undefined);
});
test("Python snapshots remain explicitly marked as Python in Agent context", () => {
  const message = attachmentMessage("Review this", [
    {
      id: "py",
      name: "test.py",
      source: "print(42)",
      language: "python",
      kind: "model",
    },
  ]);
  assert.match(message, /"format":"Python"/);
});

test("fresh workspaces default to Python while saved and legacy QASM drafts remain intact", () => {
  const fresh = initial();
  assert.equal(fresh.language, "python");
  assert.equal(fresh.name, "Python Bell pair");
  assert.match(fresh.source, /fq.save/);
  const legacy = restoreWorkspace(
    { getItem: (key) => (key === "fq-code" ? "OPENQASM 2.0;" : null) },
    "model",
  );
  assert.equal(legacy.language, "qasm");
  assert.equal(legacy.source, "OPENQASM 2.0;");
  const saved = restoreWorkspace(
    {
      getItem: (key) =>
        key === "fq-react-workspace-v1"
          ? JSON.stringify({
              language: "qasm",
              source: "unsaved draft",
              name: "Draft",
            })
          : null,
    },
    "model",
  );
  assert.equal(saved.language, "qasm");
  assert.equal(saved.source, "unsaved draft");
});

test("refresh restores the Agent panel open state independently of the active workbench page", () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  let state = workspaceReducer(initial(), { type: "agent", open: true });
  persistWorkspace(storage, state);
  const restored = restoreWorkspace(storage, "program");
  assert.equal(restored.agentOpen, true);
  assert.equal(restored.page, "program");
  assert.equal(restored.source, state.source);
  state = workspaceReducer(restored, { type: "agent", open: false });
  persistWorkspace(storage, state);
  assert.equal(restoreWorkspace(storage, "program").agentOpen, false);
  data.set("fq-react-workspace-v1", JSON.stringify({ agentOpen: "false" }));
  assert.equal(restoreWorkspace(storage, "model").agentOpen, false);
});
