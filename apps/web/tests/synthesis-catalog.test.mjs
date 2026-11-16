import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  synthesisExamples,
  synthesisCategories,
  synthesisRevision,
  synthesisAcceptance,
  matchingSynthesisExamples,
  synthesisExampleCopy,
  synthesisExampleTree,
  recordedSynthesisCheck,
} from "../src/state/synthesis-catalog.ts";
import { workspaceReducer } from "../src/state/reducer.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";

test("pinned catalog separates documented programs from editable integrations", () => {
  assert.equal(synthesisExamples.length, 216);
  assert.equal(new Set(synthesisExamples.map((item) => item.id)).size, 216);
  assert.deepEqual(
    synthesisCategories.map(
      (category) =>
        synthesisExamples.filter((item) => item.category === category).length,
    ),
    [43, 59, 12, 55, 47],
  );
  const editable = synthesisExamples.filter((item) => item.source);
  assert.equal(editable.length, 10);
  assert.equal(synthesisAcceptance.results.length, editable.length);
  assert.equal("sdkRoot" in synthesisAcceptance, false);
  assert.match(synthesisAcceptance.sdkCodeSha256, /^[a-f0-9]{64}$/);
  for (const item of synthesisExamples)
    assert.ok(item.readme.includes(synthesisRevision));
  for (const item of editable) {
    assert.ok(recordedSynthesisCheck(item));
    assert.equal(
      recordedSynthesisCheck({ ...item, sourceSha256: "changed" }),
      undefined,
    );
    assert.equal(
      createHash("sha256").update(item.source).digest("hex"),
      item.sourceSha256,
    );
    assert.ok(item.source.includes("fq.save("));
    assert.ok(!item.source.includes("_missing"));
    assert.ok(!item.source.includes("hasattr(_synth"));
    assert.ok(item.requiredCapabilities.length > 0);
    assert.ok(item.comparison.endsWith(".comparisons.circuit"));
    assert.ok(item.purpose);
  }
  assert.throws(
    () =>
      synthesisExampleCopy(
        synthesisExamples.find((item) => !item.source),
        [],
      ),
    /not been integrated/,
  );
});

test("search spans research direction, nested path and purpose; tree keeps all matches", () => {
  assert.ok(matchingSynthesisExamples("chemistry").length > 5);
  assert.ok(
    matchingSynthesisExamples("QAOA max cut").some((item) => item.source),
  );
  assert.equal(matchingSynthesisExamples("unmatched-98765").length, 0);
  const tree = synthesisExampleTree(synthesisExamples);
  assert.equal(
    tree.reduce((total, node) => total + node.count, 0),
    216,
  );
  const leaves = [];
  function walk(nodes) {
    for (const node of nodes) {
      leaves.push(...node.entries);
      walk(node.children);
    }
  }
  walk(tree);
  assert.equal(new Set(leaves.map((item) => item.id)).size, 216);
});

test("opening an official copy preserves editor draft, undo and saved models", () => {
  const item = synthesisExamples.find((item) => item.source);
  const copy = synthesisExampleCopy(item, []);
  assert.notEqual(synthesisExampleCopy(item, [copy]).name, copy.name);
  const state = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    name: "My unsaved research",
    source: "# keep unsaved work",
    language: "python",
    models: [copy],
  };
  const next = workspaceReducer(state, {
    type: "model",
    model: synthesisExampleCopy(item, state.models),
    preserveDraft: true,
  });
  assert.equal(next.source, item.source);
  assert.ok(next.models.some((model) => model.source === state.source));
  assert.ok(next.models.some((model) => model.name === copy.name));
  assert.equal(next.undo.at(-1), state.source);
  assert.equal(next.languageDrafts.python.source, state.source);
});
