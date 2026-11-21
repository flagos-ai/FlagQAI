import test from "node:test";
import assert from "node:assert/strict";
import {
  notebookHistory,
  splitCell,
  mergeCell,
} from "../src/state/notebook-editing.ts";

const cells = [
  { id: "a", cell_type: "code", source: "first\nsecond" },
  { id: "b", cell_type: "markdown", source: "# Notes" },
];
test("notebook edits undo and redo source plus structure without changing originals", () => {
  const initial = { cells, past: [], future: [] };
  const split = notebookHistory(initial, {
    type: "edit",
    cells: splitCell(cells, "a", 6, "c"),
    time: 1,
  });
  assert.deepEqual(
    split.cells.map((c) => c.source),
    ["first\n", "second", "# Notes"],
  );
  assert.deepEqual(notebookHistory(split, { type: "undo" }).cells, cells);
  assert.deepEqual(
    notebookHistory(notebookHistory(split, { type: "undo" }), { type: "redo" })
      .cells,
    split.cells,
  );
  assert.equal(mergeCell(cells, 0), cells);
  assert.equal(mergeCell(split.cells, 0)[0].source, "first\n\nsecond");
  assert.equal(cells[0].source, "first\nsecond");
});
test("typing coalesces by cell and time; branching invalidates redo", () => {
  let state = { cells, past: [], future: [] };
  for (let i = 0; i < 3; i++)
    state = notebookHistory(state, {
      type: "edit",
      cells: [{ ...cells[0], source: String(i) }, cells[1]],
      group: "a",
      time: 100 + i * 100,
    });
  assert.equal(state.past.length, 1);
  state = notebookHistory(state, { type: "undo" });
  assert.deepEqual(state.cells, cells);
  state = notebookHistory(state, {
    type: "edit",
    cells: cells.slice(1),
    time: 1000,
  });
  assert.equal(state.future.length, 0);
  assert.equal(notebookHistory(state, { type: "load", cells }).past.length, 0);
});
