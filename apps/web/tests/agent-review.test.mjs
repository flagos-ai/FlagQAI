import test from "node:test";
import assert from "node:assert/strict";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
import {
  openAgentReview,
  reviewMatches,
  acceptReviewAction,
  reviewActionValid,
} from "../src/state/agent-review.ts";
function fixture(conflict = true) {
  let state = restoreWorkspace({ getItem: () => null }, "model");
  state = { ...state, name: "Review test", source: "base", language: "python" };
  state = reduce(state, {
    type: "link-editor",
    name: state.name,
    expectedSource: state.source,
    file: {
      id: "test.py",
      path: "test.py",
      source: "base",
      revision: "base-rev",
    },
  });
  if (conflict)
    state = reduce(state, { type: "edit", source: "my unsaved draft" });
  return reduce(state, {
    type: "file-changed",
    id: "test.py",
    source: "agent proposal",
    revision: "agent-rev",
    time: 100,
  });
}
test("three-way snapshot preserves shared base, local draft and incoming proposal", () => {
  const s = fixture(),
    r = openAgentReview(s);
  assert.equal(r.base, "base");
  assert.equal(r.draft, "my unsaved draft");
  assert.equal(r.incoming, "agent proposal");
  const next = reduce(s, acceptReviewAction(s, r));
  assert.equal(next.source, r.incoming);
  assert.equal(reduce(next, { type: "undo" }).source, r.draft);
});
test("review decisions reject newer local edits, source revisions and renamed or switched models", () => {
  const s = fixture(),
    r = openAgentReview(s),
    a = acceptReviewAction(s, r);
  for (const next of [
    { ...s, name: "other" },
    { ...s, language: "qasm" },
    reduce(s, { type: "edit", source: "new local" }),
    reduce(s, {
      type: "file-changed",
      id: "test.py",
      source: "new agent",
      revision: "new",
      time: 200,
    }),
  ]) {
    assert.equal(reviewMatches(next, r), false);
    assert.throws(() => acceptReviewAction(next, r));
  }
  assert.equal(
    reviewActionValid(reduce(s, { type: "edit", source: "new local" }), a),
    false,
  );
  assert.equal(reviewActionValid(s, a), true);
});
test("accepting synchronized code preserves subsequent local edits instead of executing an old Agent proposal", () => {
  let s = fixture(false);
  s = reduce(s, { type: "edit", source: "new local after sync" });
  const r = openAgentReview(s);
  assert.equal(
    reduce(s, acceptReviewAction(s, r)).source,
    "new local after sync",
  );
});
test("independent reviewed versions do not modify source, undo, links or files and retain provenance through refresh", () => {
  const s = fixture(),
    r = openAgentReview(s),
    a = { type: "save-review-version", review: r, source: r.incoming };
  const next = reduce(s, a);
  assert.equal(next.source, s.source);
  assert.deepEqual(next.editorLink, s.editorLink);
  assert.deepEqual(next.undo, s.undo);
  assert.equal(next.models[0].source, r.incoming);
  assert.deepEqual(next.models[0].reviewOrigin, {
    fileId: r.id,
    revision: r.revision,
  });
  assert.equal(reduce(next, a).models.length, next.models.length);
  let saved;
  const storage = {
    getItem: () => saved ?? null,
    setItem: (key, value) => {
      if (key === "fq-react-workspace-v1") saved = value;
    },
  };
  persistWorkspace(storage, next);
  const restored = restoreWorkspace(storage, "model");
  assert.deepEqual(restored.models[0], next.models[0]);
  assert.equal(restored.source, s.source);
  const stale = reduce(s, { type: "edit", source: "newer" });
  assert.equal(reduce(stale, a), stale);
});
test("reviewed merge remains undoable and saved proposals can be inspected after rejection", () => {
  const s = fixture(),
    r = openAgentReview(s),
    next = reduce(s, acceptReviewAction(s, r, "reviewed merged source"));
  assert.equal(next.editorLink.change.agentSource, r.incoming);
  assert.equal(next.source, "reviewed merged source");
  const undo = reduce(next, {
    type: "review-agent-change",
    id: r.id,
    revision: r.revision,
    expectedSource: next.source,
    decision: "undo",
  });
  assert.equal(undo.source, r.draft);
  assert.equal(openAgentReview(undo).incoming, r.incoming);
  assert.throws(() => acceptReviewAction(undo, openAgentReview(undo)));
});
