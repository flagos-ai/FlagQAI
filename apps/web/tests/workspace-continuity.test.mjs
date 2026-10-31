import test from "node:test";
import assert from "node:assert/strict";
import {
  editorPosition,
  readPositions,
  rememberPosition,
  readFolders,
  findProjectFiles,
  workspaceShortcut,
} from "../src/state/workspace-continuity.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";

test("editor positions recover per-file selection/direction and scroll with bounded invalid data", () => {
  const position = {
    start: 90,
    end: 120,
    direction: "backward",
    top: 720,
    left: 80,
  };
  let cache = rememberPosition({}, "project:a:main.py", position);
  cache = rememberPosition(cache, "project:b:main.py", {
    ...position,
    start: 2,
    end: 2,
    top: 0,
  });
  const restored = readPositions({ getItem: () => JSON.stringify(cache) });
  assert.deepEqual(restored["project:a:main.py"], position);
  assert.equal(restored["project:b:main.py"].start, 2);
  assert.equal(editorPosition({ top: 12.5, left: 8.25 }).top, 12.5);
  assert.equal(editorPosition({ top: 12.5, left: 8.25 }).left, 8.25);
  assert.deepEqual(editorPosition(position, 5), {
    ...position,
    start: 5,
    end: 5,
  });
  assert.deepEqual(
    editorPosition({
      start: NaN,
      end: -1,
      top: Infinity,
      left: -10,
      direction: "invalid",
    }),
    { start: 0, end: 0, top: 0, left: 0, direction: "none" },
  );
  for (let index = 0; index < 100; index++)
    cache = rememberPosition(cache, "file:" + index, position);
  assert.equal(Object.keys(cache).length, 96);
  assert.deepEqual(readPositions({ getItem: () => "[1,2]" }), {});
  assert.deepEqual(
    readPositions({
      getItem: () => {
        throw Error("Storage denied");
      },
    }),
    {},
  );
});
test("folder preferences are scoped and malformed paths cannot enter the restored tree", () => {
  const a = "a".repeat(32),
    b = "b".repeat(32);
  const restored = readFolders({
    getItem: () =>
      JSON.stringify({
        [a]: ["src", "src/algorithms", "../outside", ".env", null],
        [b]: ["examples"],
        invalid: ["src"],
      }),
  });
  assert.deepEqual(restored, {
    [a]: ["src", "src/algorithms"],
    [b]: ["examples"],
  });
  assert.deepEqual(readFolders({ getItem: () => "null" }), {});
});
test("file search ranks exact names, scopes path terms and leaves source ordering intact", () => {
  const files = [
    { path: "src/helper.py" },
    { path: "main.py" },
    { path: "src/main.py" },
    { path: "bell.fqx" },
  ];
  assert.equal(
    findProjectFiles(files, "", "src/main.py")[0].path,
    "src/main.py",
  );
  assert.deepEqual(
    findProjectFiles(files, "SRC MAIN").map((file) => file.path),
    ["src/main.py"],
  );
  assert.equal(findProjectFiles(files, "main.py")[0].path, "main.py");
  assert.equal(findProjectFiles(files, "missing").length, 0);
  assert.equal(files[0].path, "src/helper.py");
});
test("shortcut matching respects composition and extra modifiers for both platforms", () => {
  assert.equal(workspaceShortcut({ key: "P", metaKey: true }), "find");
  assert.equal(workspaceShortcut({ key: "Enter", ctrlKey: true }), "run");
  for (const event of [
    { key: "Enter" },
    { key: "Enter", ctrlKey: true, isComposing: true },
    { key: "p", metaKey: true, altKey: true },
    { key: "Enter", ctrlKey: true, shiftKey: true },
  ])
    assert.equal(workspaceShortcut(event), undefined);
});
test("reopening an existing project file preserves tab order and independent drafts through refresh", () => {
  const project = {
    id: "a".repeat(32),
    path: "example",
    name: "example",
    root: "/workspace/example",
  };
  const file = (path) => ({
    id: "project:" + project.id + ":" + path,
    path,
    workspace_path: "example/" + path,
    source: path,
    revision: path,
    project: { id: project.id, path },
  });
  let state = restoreWorkspace({ getItem: () => null }, "model");
  for (const path of ["main.py", "helper.py", "src/gates.py"])
    state = reduce(state, {
      type: "project-open-file",
      project,
      file: file(path),
    });
  const order = state.projectTabs.map((tab) => tab.path);
  state = reduce(state, {
    type: "project-open-file",
    project,
    file: file("main.py"),
  });
  state = reduce(state, { type: "edit", source: "unsaved main" });
  state = reduce(state, {
    type: "project-open-file",
    project,
    file: file("helper.py"),
  });
  assert.deepEqual(
    state.projectTabs.map((tab) => tab.path),
    order,
  );
  const saved = new Map();
  persistWorkspace({ setItem: (key, value) => saved.set(key, value) }, state);
  state = restoreWorkspace({ getItem: (key) => saved.get(key) }, "model");
  assert.equal(state.activeProjectTab, file("helper.py").id);
  assert.deepEqual(
    state.projectTabs.map((tab) => tab.path),
    order,
  );
  state = reduce(state, { type: "project-tab", id: file("main.py").id });
  assert.equal(state.source, "unsaved main");
});
