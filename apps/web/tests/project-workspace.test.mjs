import test from "node:test";
import assert from "node:assert/strict";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
const project = {
  id: "a".repeat(32),
  name: "bell",
  root: "/workspace/bell",
  path: "bell",
  files: [],
};
const file = (path, source, revision = source) => ({
  id: "project:" + project.id + ":" + path,
  path,
  source,
  revision,
  workspace_path: "bell/" + path,
  project: { id: project.id, path },
});
const open = (state, path, source, revision) =>
  reduce(state, {
    type: "project-open-file",
    project,
    file: file(path, source, revision),
  });
const initial = () => restoreWorkspace({ getItem: () => null }, "model");
test("project tabs preserve independent drafts, undo, selected run and scratch across refresh", () => {
  const scratch = initial();
  let state = open(scratch, "main.py", "main");
  state = reduce(state, { type: "edit", source: "unsaved main" });
  state = reduce(state, { type: "python-run", id: "main-run" });
  state = open(state, "helper.py", "helper");
  state = reduce(state, { type: "edit", source: "unsaved helper" });
  state = reduce(state, { type: "project-tab", id: file("main.py").id });
  assert.equal(state.source, "unsaved main");
  assert.equal(state.pythonRunId, "main-run");
  assert.deepEqual(state.undo, ["main"]);
  const storage = new Map();
  persistWorkspace({ setItem: (key, value) => storage.set(key, value) }, state);
  state = restoreWorkspace({ getItem: (key) => storage.get(key) }, "model");
  assert.equal(state.editorLink.project.path, "main.py");
  state = reduce(state, { type: "project-tab", id: file("helper.py").id });
  assert.equal(state.source, "unsaved helper");
  state = reduce(state, { type: "project-tab" });
  assert.equal(state.source, scratch.source);
});
test("inactive Agent edits protect dirty drafts; late polls cannot undo a local save", () => {
  let state = open(initial(), "main.py", "old");
  state = reduce(state, { type: "edit", source: "my draft" });
  state = open(state, "helper.py", "helper");
  state = reduce(state, {
    type: "project-file-update",
    file: file("main.py", "Agent version", "r2"),
  });
  assert.equal(state.source, "helper");
  state = reduce(state, { type: "project-tab", id: file("main.py").id });
  assert.equal(state.source, "my draft");
  assert.equal(state.editorLink.incoming.source, "Agent version");
  state = reduce(state, {
    type: "resolve-file",
    id: state.editorLink.id,
    revision: "r2",
    expectedSource: "my draft",
    source: "my draft",
  });
  state = reduce(state, {
    type: "project-file-saved",
    file: file("main.py", "my draft", "r3"),
    source: "my draft",
  });
  assert.equal(state.editorLink.base, "my draft");
  state = reduce(state, {
    type: "file-changed",
    id: state.editorLink.id,
    source: "stale poll",
    revision: "r2",
    time: 1,
  });
  assert.equal(state.source, "my draft");
});
test("closing a dirty tab retains the draft and saving it late does not replace another tab", () => {
  let state = open(initial(), "main.py", "old");
  state = reduce(state, { type: "edit", source: "new draft" });
  state = reduce(state, { type: "project-close-tab", id: file("main.py").id });
  state = open(state, "helper.py", "helper");
  state = reduce(state, {
    type: "project-file-saved",
    file: file("main.py", "old", "r2"),
    source: "old",
  });
  assert.equal(state.source, "helper");
  state = open(state, "main.py", "old", "r2");
  assert.equal(state.source, "new draft");
});
