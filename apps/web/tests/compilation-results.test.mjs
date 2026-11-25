import assert from "node:assert/strict";
import test from "node:test";
import {
  compilationResults,
  circuitMatchesSource,
} from "../src/state/compilation-results.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
import { workspaceReducer } from "../src/state/reducer.ts";

const initial = () => restoreWorkspace({ getItem: () => null }, "model");
const program = {
  id: "compiled",
  name: "model",
  source: "qasm",
  created: 1,
  compiled: {
    qubits: 2,
    depth: 2,
    instructions: [],
    gate_counts: {},
    version: "0.4.0",
  },
};

test("legacy synthesis links and navigation preserve drafts and open Model resources", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const state = {
    ...initial(),
    source: "unsaved research",
    undo: ["original"],
    agentDraft: { name: "draft", source: "kept", language: "python", undo: [] },
  };
  persistWorkspace(storage, state);
  const restored = restoreWorkspace(storage, "synthesis");
  assert.equal(restored.page, "model");
  assert.equal(restored.modelPanel, "compilation");
  assert.equal(restored.source, state.source);
  assert.equal(restored.agentDraft.source, state.agentDraft.source);
  assert.equal(restored.agentDraft.name, state.agentDraft.name);
  assert.deepEqual(restored.agentDraft.undo, state.agentDraft.undo);
  const navigated = workspaceReducer(state, {
    type: "navigate",
    page: "synthesis",
  });
  assert.equal(navigated.page, "model");
  assert.equal(navigated.modelPanel, "compilation");
  assert.deepEqual(navigated.undo, state.undo);
  persistWorkspace(storage, navigated);
  assert.equal(restoreWorkspace(storage, "model").modelPanel, "compilation");
});

test("in-place compile retains editing and does not steal a later view or a newer source", () => {
  const state = {
    ...initial(),
    language: "qasm",
    name: "model",
    source: "qasm",
  };
  const action = { type: "compiled", program, stayInModel: true };
  const compiled = workspaceReducer(state, action);
  assert.equal(compiled.page, "model");
  assert.equal(compiled.modelPanel, "compilation");
  const moved = workspaceReducer({ ...state, page: "jobs" }, action);
  assert.equal(moved.page, "jobs");
  assert.equal(moved.selectedProgramId, state.selectedProgramId);
  const newer = workspaceReducer({ ...state, source: "newer" }, action);
  assert.equal(newer.source, "newer");
  assert.notEqual(newer.modelPanel, "compilation");
  assert.equal(circuitMatchesSource(newer, newer.programs[0]), false);
  assert.equal(
    workspaceReducer(state, { type: "compiled", program }).page,
    "program",
  );
});

test("Python resources require the selected run, executed source and exact artifact digest", () => {
  const run = {
    id: "run",
    source: "python",
    source_hash: "source-sha",
    experiments: [{ id: "saved", sha256: "file-sha" }],
  };
  const saved = {
    ...program,
    id: "saved",
    origin: {
      language: "python",
      run_id: "run",
      source: "python",
      source_hash: "source-sha",
    },
    experiment: { sha256: "file-sha" },
  };
  const state = {
    ...initial(),
    source: "python",
    pythonRunId: "run",
    programs: [saved],
  };
  assert.deepEqual(compilationResults(state, run), [saved]);
  assert.deepEqual(compilationResults(state, { ...run, id: "old" }), []);
  for (const changed of [
    { ...saved, origin: { ...saved.origin, run_id: "other" } },
    { ...saved, origin: { ...saved.origin, source: "other" } },
    { ...saved, origin: { ...saved.origin, source_hash: "other" } },
    { ...saved, experiment: { sha256: "other" } },
  ])
    assert.deepEqual(
      compilationResults({ ...state, programs: [changed] }, run),
      [],
    );
  const edited = { ...state, source: "edited" };
  assert.deepEqual(compilationResults(edited, run), [saved]);
  assert.equal(circuitMatchesSource(edited, saved), false);
});

test("unchanged entry code does not make changed project dependencies current", () => {
  const project = {
    id: "project",
    entry: "main.py",
    files: [
      { path: "main.py", sha256: "entry" },
      { path: "helper.py", sha256: "original" },
    ],
  };
  const saved = {
    ...program,
    origin: { language: "python", source: "python", project },
  };
  const state = {
    ...initial(),
    source: "python",
    editorLink: { project: { id: "project", path: "main.py" } },
    project: {
      id: "project",
      files: [
        { path: "main.py", kind: "source", revision: "entry" },
        { path: "helper.py", kind: "source", revision: "original" },
      ],
    },
  };
  assert.equal(circuitMatchesSource(state, saved), true);
  state.project.files[1].revision = "changed";
  assert.equal(circuitMatchesSource(state, saved), false);
});
