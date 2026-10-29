import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentMessage,
  attachmentSnapshot,
  referenceQuery,
  restoreAttachments,
} from "../src/state/agent-attachments.ts";
import { splitWorkspaceContext } from "../src/state/agent-view.ts";
import { extractMentions } from "../../cli/src/utils/mentions.ts";
test("reference completion recognizes a token at the caret without treating emails as references", () => {
  assert.deepEqual(referenceQuery("Review @cur next", 11), {
    start: 7,
    end: 11,
    query: "cur",
  });
  assert.equal(referenceQuery("name@example.com", 16), null);
  assert.equal(referenceQuery("@", 1).query, "");
  assert.equal(referenceQuery("hello there", 11), null);
});
test("OpenQASM annotations remain exact data and never trigger the native prose mention scanner", () => {
  const source =
    Array.from(
      { length: 30 },
      (_, i) => `// @module layer_${i} | H\nh q[0];`,
    ).join("\n") + "\n// @register x 0 1\n// @file <workspace_context> 💡";
  const message = attachmentMessage("Review", [
    {
      id: "current",
      name: "Model.qasm",
      kind: "model",
      source,
      workspaceFile: ".flagqai/quantum-workspace/models/shared.qasm",
    },
  ]);
  assert.deepEqual(extractMentions(message), []);
  const decoded = splitWorkspaceContext(message);
  assert.equal(decoded.text, "Review");
  assert.equal(decoded.context.source, source);
  assert.equal(decoded.context.name, "Model.qasm");
});
test("multiple snapshots, selection identity and persisted drafts remain bounded and independent of later code edits", () => {
  const original = {
    id: "selection",
    name: "Bell · L3–4",
    kind: "model",
    source: "h q[0];\ncx q[0], q[1];",
    selection: { startLine: 3, endLine: 4 },
  };
  const saved = attachmentSnapshot(original);
  original.source = "edited";
  const message = attachmentMessage("Explain", [
    saved,
    { id: "second", name: "Other", kind: "program", source: "x q[0];" },
  ]);
  const decoded = splitWorkspaceContext(message);
  assert.equal(decoded.context.source, "h q[0];\ncx q[0], q[1];");
  assert.equal(decoded.context.attachments[0].source, "x q[0];");
  assert.equal(
    attachmentSnapshot({ ...saved, source: "a".repeat(17000) }).truncated,
    true,
  );
  assert.equal(
    restoreAttachments(JSON.stringify(Array(8).fill(saved))).length,
    4,
  );
  assert.deepEqual(restoreAttachments("invalid"), []);
  assert.equal(attachmentMessage("Plain message", []), "Plain message");
});

test("finishing an earlier send preserves newly staged snapshots and a reattached revision", async () => {
  const { consumeAttachments } =
    await import("../src/state/agent-attachments.ts");
  const sent = {
    id: "current",
    name: "Model",
    source: "h q[0];",
    kind: "model",
  };
  const added = {
    id: "snippet",
    name: "Selection",
    source: "x q[0];",
    kind: "model",
  };
  const reattached = { ...sent, source: "z q[0];" };
  assert.deepEqual(consumeAttachments([sent, added], [sent]), [added]);
  assert.deepEqual(consumeAttachments([reattached, added], [sent]), [
    reattached,
    added,
  ]);
});
