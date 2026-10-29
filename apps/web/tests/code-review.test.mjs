import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lineDiff,
  changedLines,
  sourceRevision,
} from "../src/state/code-diff.ts";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
function linked() {
  const state = reduce(restoreWorkspace({ getItem: () => null }, "model"), {
    type: "language",
    language: "qasm",
  });
  return reduce(
    { ...state, source: "a\nb\nc" },
    {
      type: "link-editor",
      name: state.name,
      expectedSource: "a\nb\nc",
      file: {
        id: "a".repeat(32) + ".qasm",
        path: "model.qasm",
        source: "a\nb\nc",
        revision: "base",
      },
    },
  );
}
function change(state, source, revision = "agent-1") {
  return reduce(state, {
    type: "file-changed",
    id: state.editorLink.id,
    source,
    revision,
    time: 1,
  });
}
function decision(state, kind) {
  return {
    type: "review-agent-change",
    id: state.editorLink.id,
    revision: state.editorLink.change.revision,
    expectedSource: state.source,
    decision: kind,
  };
}
test("line diffs reconstruct both exact versions, including blank and repeated lines", () => {
  const examples = [
    ["", ""],
    ["a", ""],
    ["", "b"],
    ["a\nb\nc", "a\nx\nb\nc"],
    ["x\nx\nx", "x\ny\nx"],
    ["a\n", "a"],
    ["a\n\n", "a\n\nb\n"],
    ["π\n中文", "π\n新内容"],
  ];
  let seed = 19;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % 5;
  };
  for (let i = 0; i < 60; i++)
    examples.push([
      Array.from({ length: random() + 1 }, () => String(random())).join("\n"),
      Array.from({ length: random() + 1 }, () => String(random())).join("\n"),
    ]);
  examples.push([
    Array(1300).fill("old").join("\n"),
    Array(1300).fill("new").join("\n"),
  ]);
  for (const [before, after] of examples) {
    const rows = lineDiff(before, after);
    assert.equal(
      rows
        .filter((row) => row.kind !== "added")
        .map((row) => row.text)
        .join("\n"),
      before,
    );
    assert.equal(
      rows
        .filter((row) => row.kind !== "removed")
        .map((row) => row.text)
        .join("\n"),
      after,
    );
  }
});
test("gutter markers identify inserted and removed lines without marking shifted context", () => {
  const diff = changedLines("a\nb\nc", "a\nx\nb\nc");
  assert.deepEqual([...diff.added], [2]);
  assert.equal(diff.removedAt.size, 0);
  assert.deepEqual([...changedLines("a\nb\nc", "a\nc").removedAt], [2]);
});
test("pending streamed edits retain the first baseline and accept without changing code", () => {
  const original = linked();
  let state = change(original, "a\nfirst\nc");
  state = change(state, "a\nlatest\nc", "agent-2");
  assert.equal(state.editorLink.change.before, original.source);
  assert.equal(state.editorLink.change.after, state.source);
  const accepted = reduce(state, decision(state, "accept"));
  assert.equal(accepted.source, state.source);
  assert.equal(accepted.editorLink.change.outcome, "accepted");
  assert.equal(accepted.models, original.models);
  assert.equal(accepted.programs, original.programs);
});
test("keep and undo never write back to the Agent file or reapply the same revision", () => {
  const original = linked(),
    state = change(original, "agent code");
  for (const kind of ["keep", "undo"]) {
    const restored = reduce(state, decision(state, kind));
    assert.equal(restored.source, original.source);
    assert.equal(restored.editorLink.base, "agent code");
    assert.equal(change(restored, "agent code"), restored);
  }
  const accepted = reduce(state, decision(state, "accept"));
  assert.equal(
    reduce(accepted, decision(accepted, "undo")).source,
    original.source,
  );
});
test("late decisions and direct undo cannot overwrite subsequent user edits or Agent revisions", () => {
  const state = change(linked(), "agent code"),
    old = decision(state, "accept");
  const typed = reduce(state, { type: "edit", source: "new user draft" });
  assert.equal(reduce(typed, old), typed);
  assert.equal(reduce(typed, decision(typed, "undo")), typed);
  assert.equal(reduce(typed, decision(typed, "keep")).source, "new user draft");
  const newer = change(state, "new Agent code", "agent-2");
  assert.equal(reduce(newer, old), newer);
});
test("merged review retains rejected/proposed code and supports guarded one-step undo", () => {
  let state = change(
    reduce(linked(), { type: "edit", source: "my draft" }),
    "Agent proposal",
  );
  state = reduce(state, {
    type: "resolve-file",
    id: state.editorLink.id,
    revision: "agent-1",
    expectedSource: "my draft",
    source: "reviewed merge",
  });
  assert.equal(state.editorLink.change.agentSource, "Agent proposal");
  assert.equal(state.editorLink.change.before, "my draft");
  const restored = reduce(state, decision(state, "undo"));
  assert.equal(restored.source, "my draft");
  assert.equal(restored.editorLink.base, "Agent proposal");
  const memory = new Map(),
    storage = {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value),
    };
  persistWorkspace(storage, state);
  assert.deepEqual(
    restoreWorkspace(storage, "model").editorLink.change,
    state.editorLink.change,
  );
});
test("source version hashes use the exact UTF-8 contents, independently of display names", async () => {
  const source = "π\n中文\n";
  assert.equal(
    await sourceRevision(source),
    createHash("sha256").update(source).digest("hex"),
  );
  assert.notEqual(
    await sourceRevision(source),
    await sourceRevision(source.trim()),
  );
});

test("opening a versioned artifact keeps the existing draft as a recoverable model", () => {
  const state = { ...linked(), source: "unsaved newer experiment" };
  const next = reduce(state, {
    type: "model",
    model: {
      name: "Compiled snapshot",
      source: "older compiled code",
      language: "qasm",
    },
    preserveDraft: true,
  });
  assert.equal(next.source, "older compiled code");
  assert.ok(
    next.models.some(
      (model) =>
        model.source === state.source && model.name.startsWith("Draft ·"),
    ),
  );
});
test("accepting a review does not hide a compiler error for unchanged code", () => {
  const state = {
    ...change(linked(), "invalid Agent code"),
    error: {
      source: "invalid Agent code",
      message: "Compiler rejected the circuit",
    },
  };
  assert.deepEqual(reduce(state, decision(state, "accept")).error, state.error);
});
