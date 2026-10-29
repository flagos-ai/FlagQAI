import test from "node:test";
import assert from "node:assert/strict";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
const storage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (k, v) => map.set(k, v),
  };
};
function linked() {
  const state = reduce(restoreWorkspace(storage(), "model"), {
    type: "language",
    language: "qasm",
  });
  return reduce(state, {
    type: "link-editor",
    name: state.name,
    expectedSource: state.source,
    file: {
      id: "a".repeat(32) + ".qasm",
      path: ".flagqai/quantum-workspace/models/" + "a".repeat(32) + ".qasm",
      source: state.source,
      revision: "base",
    },
  });
}
const change = (s, source, revision = "next") =>
  reduce(s, {
    type: "file-changed",
    id: s.editorLink.id,
    source,
    revision,
    time: 100,
  });
test("Agent changes update a clean editor and remain undoable without changing saved models or compiled snapshots", () => {
  const state = linked();
  const next = change(state, "agent source");
  assert.equal(next.source, "agent source");
  assert.equal(next.editorLink.base, "agent source");
  assert.equal(next.models, state.models);
  assert.equal(next.programs, state.programs);
  assert.equal(reduce(next, { type: "undo" }).source, state.source);
  assert.equal(change(next, "agent source"), next);
});
test("typing, including clearing the draft, wins a race with an incoming Agent change", () => {
  let state = reduce(linked(), { type: "edit", source: "" });
  state = change(state, "agent source");
  assert.equal(state.source, "");
  assert.equal(state.editorLink.incoming.source, "agent source");
  state = change(state, "newer agent source", "newer");
  assert.equal(state.source, "");
  assert.equal(state.editorLink.incoming.revision, "newer");
  const mem = storage();
  persistWorkspace(mem, state);
  const restored = restoreWorkspace(mem, "model");
  assert.equal(restored.source, "");
  assert.equal(restored.editorLink.incoming.source, "newer agent source");
});
test("review uses compare-and-swap for both draft and incoming revision; keeping a draft advances the baseline only", () => {
  let state = change(
    reduce(linked(), { type: "edit", source: "my draft" }),
    "agent source",
  );
  const decision = {
    type: "resolve-file",
    id: state.editorLink.id,
    revision: "next",
    expectedSource: "my draft",
    source: "merged source",
  };
  const edited = reduce(state, { type: "edit", source: "even newer draft" });
  assert.equal(reduce(edited, decision), edited);
  const newer = change(state, "new agent", "newer");
  assert.equal(reduce(newer, decision), newer);
  const merged = reduce(state, decision);
  assert.equal(merged.source, "merged source");
  assert.equal(merged.editorLink.base, "agent source");
  assert.equal(reduce(merged, { type: "undo" }).source, "my draft");
  const kept = reduce(state, { ...decision, source: "my draft" });
  assert.equal(kept.source, "my draft");
  assert.equal(kept.editorLink.incoming, undefined);
  assert.equal(change(kept, "agent source"), kept);
});
test("switching or disconnecting a model ignores late file responses; reverting the file clears stale review", () => {
  let state = linked();
  const id = state.editorLink.id;
  const switched = reduce(state, {
    type: "model",
    model: { name: "Other", source: "different" },
  });
  assert.equal(
    reduce(switched, {
      type: "file-changed",
      id,
      source: "old agent",
      revision: "late",
      time: 1,
    }),
    switched,
  );
  const disconnected = reduce(state, { type: "unlink-editor" });
  assert.equal(
    reduce(disconnected, {
      type: "file-changed",
      id,
      source: "old agent",
      revision: "late",
      time: 1,
    }),
    disconnected,
  );
  state = change(reduce(state, { type: "edit", source: "draft" }), "agent");
  state = change(state, state.editorLink.base, "base");
  assert.equal(state.source, "draft");
  assert.equal(state.editorLink.incoming, undefined);
});
test("sharing during an edit preserves the in-flight draft and offers review", () => {
  const initial = reduce(restoreWorkspace(storage(), "model"), {
    type: "language",
    language: "qasm",
  });
  const draft = reduce(initial, {
    type: "edit",
    source: "typed while sharing",
  });
  const linked = reduce(draft, {
    type: "link-editor",
    name: initial.name,
    expectedSource: initial.source,
    file: {
      id: "a".repeat(32) + ".qasm",
      path: "path",
      source: initial.source,
      revision: "base",
    },
  });
  assert.equal(linked.source, "typed while sharing");
  assert.equal(linked.editorLink.base, initial.source);
  assert.equal(linked.editorLink.incoming.source, initial.source);
});
