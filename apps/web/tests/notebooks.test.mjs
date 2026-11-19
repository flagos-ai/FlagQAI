import test from "node:test";
import assert from "node:assert/strict";
import {
  matchingNotebooks,
  notebookExamples,
  parseNotebook,
  notebookText,
} from "../src/state/notebooks.ts";
import { workspaceReducer } from "../src/state/reducer.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";

test("the notebook catalog is separate from program-only examples", () => {
  assert.equal(notebookExamples.length, 212);
  assert.deepEqual(
    ["algorithms", "applications", "community", "functions", "tutorials"].map(
      (category) =>
        notebookExamples.filter((e) => e.category === category).length,
    ),
    [45, 69, 18, 31, 49],
  );
  assert.ok(matchingNotebooks("qaoa").length > 2);
  assert.ok(matchingNotebooks("chemistry molecule").length > 0);
  assert.equal(matchingNotebooks("not-present-12980").length, 0);
});
test("notebook parsing keeps cells as inert data and rejects malformed source", () => {
  const value = {
    nbformat: 4,
    cells: [
      { cell_type: "markdown", source: ["<script>bad()</script>\n", "$x^2$"] },
      {
        cell_type: "code",
        source: "print(1)",
        outputs: [{ data: { "text/html": "<iframe/>" } }],
      },
    ],
  };
  assert.equal(parseNotebook(value), value);
  assert.equal(
    notebookText(value.cells[0].source),
    "<script>bad()</script>\n$x^2$",
  );
  assert.throws(() => parseNotebook({ ...value, nbformat: 3 }));
  assert.throws(() => parseNotebook({ nbformat: 4, cells: [null] }));
  assert.throws(() =>
    parseNotebook({
      nbformat: 4,
      cells: [{ cell_type: "code", source: [{}] }],
    }),
  );
});
test("opening a notebook research copy retains the existing editor draft", () => {
  const state = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    source: "# unsaved research",
    name: "Draft",
    language: "python",
  };
  const project = {
    id: "a".repeat(32),
    name: "Notebook copy",
    path: "notebook-copies/test",
    root: "/workspace/notebook-copies/test",
  };
  const file = {
    id: "project:entry",
    path: "run_notebook.py",
    workspace_path: "notebook-copies/test/run_notebook.py",
    source: "# pinned launcher",
    revision: "123",
    project: { id: project.id, path: project.path },
  };
  const next = workspaceReducer(
    workspaceReducer(state, { type: "project-select", project }),
    { type: "project-open-file", project, file },
  );
  assert.equal(next.projectScratch.source, state.source);
  assert.equal(next.source, file.source);
  assert.equal(
    workspaceReducer(next, { type: "project-tab" }).source,
    state.source,
  );
});
