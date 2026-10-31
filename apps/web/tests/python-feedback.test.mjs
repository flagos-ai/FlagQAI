import test from "node:test";
import assert from "node:assert/strict";
import { pythonResultFreshness } from "../src/state/python-feedback.ts";
import { projectNeedsReview } from "../src/state/project-workspace.ts";
import {
  persistWorkspace,
  restoreWorkspace,
} from "../src/state/persistence.ts";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";
const id = "a".repeat(32);
const project = {
  id,
  name: "example",
  path: "example",
  root: "/workspace/example",
  files: [
    { path: "main.py", kind: "source", revision: "disk-entry" },
    { path: "helper.py", kind: "source", revision: "helper-v1" },
  ],
};
const file = (path) => ({
  id: `project:${id}:${path}`,
  path,
  workspace_path: `example/${path}`,
  source: path === "main.py" ? "entry draft" : "helper",
  revision: path === "main.py" ? "disk-entry" : "helper-v1",
  project: { id, path },
});
const state = () =>
  reduce(restoreWorkspace({ getItem: () => null }, "model"), {
    type: "project-open-file",
    project,
    file: file("main.py"),
  });
const run = {
  id: "run-1",
  source: "entry draft",
  status: "completed",
  project: {
    id,
    entry: "main.py",
    files: [
      { path: "main.py", sha256: "draft-entry" },
      { path: "helper.py", sha256: "helper-v1" },
    ],
  },
};
test("result freshness compares dependencies and file identity while allowing a frozen entry draft", () => {
  let current = state();
  assert.equal(pythonResultFreshness(run, current), "current");
  assert.equal(
    pythonResultFreshness(run, { ...current, source: "new entry" }),
    "changed",
  );
  current = reduce(current, {
    type: "project-open-file",
    project,
    file: file("helper.py"),
  });
  assert.equal(pythonResultFreshness(run, current), "other-file");
  current = reduce(current, { type: "edit", source: "unsaved helper" });
  current = reduce(current, { type: "project-tab", id: file("main.py").id });
  assert.equal(pythonResultFreshness(run, current), "changed");
  assert.equal(
    pythonResultFreshness(run, {
      ...state(),
      project: { ...project, files: [project.files[0]] },
    }),
    "changed",
  );
  assert.equal(
    pythonResultFreshness(run, {
      ...state(),
      project: { ...project, files: undefined },
    }),
    "unknown",
  );
  assert.equal(
    pythonResultFreshness(run, {
      ...state(),
      project: {
        ...project,
        files: [
          project.files[0],
          { ...project.files[1], revision: "helper-v2" },
        ],
      },
    }),
    "changed",
  );
});
test("Agent notice survives tab selection and refresh; resolving review clears only the notice", () => {
  let current = state();
  current = reduce(current, {
    type: "project-open-file",
    project,
    file: file("helper.py"),
  });
  current = reduce(current, { type: "project-tab", id: file("main.py").id });
  current = reduce(current, {
    type: "project-file-update",
    file: {
      ...file("helper.py"),
      source: "Agent helper",
      revision: "helper-v2",
    },
  });
  const saved = new Map();
  persistWorkspace({ setItem: (key, value) => saved.set(key, value) }, current);
  current = restoreWorkspace({ getItem: (key) => saved.get(key) }, "model");
  let tab = current.projectTabs.find((tab) => tab.path === "helper.py");
  assert.equal(projectNeedsReview(tab), true);
  current = reduce(current, { type: "project-tab", id: tab.id });
  assert.equal(
    projectNeedsReview(
      current.projectTabs.find((tab) => tab.id === current.activeProjectTab),
    ),
    true,
  );
  current = reduce(current, {
    type: "review-agent-change",
    id: tab.id,
    revision: "helper-v2",
    expectedSource: "Agent helper",
    decision: "accept",
  });
  tab = current.projectTabs.find((tab) => tab.id === current.activeProjectTab);
  assert.equal(projectNeedsReview(tab), false);
  current = reduce(current, { type: "edit", source: "my new helper draft" });
  current = reduce(current, {
    type: "file-changed",
    id: tab.id,
    source: "Agent helper v3",
    revision: "helper-v3",
    time: Date.now(),
  });
  tab = current.projectTabs.find((tab) => tab.id === current.activeProjectTab);
  assert.equal(projectNeedsReview(tab), true);
  assert.equal(current.source, "my new helper draft");
});
