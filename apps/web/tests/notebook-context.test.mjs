import test from "node:test";
import assert from "node:assert/strict";
import {
  notebookContext,
  notebookAttachment,
} from "../src/state/notebook-context.ts";
import { attachmentMessage } from "../src/state/agent-attachments.ts";
import { splitWorkspaceContext } from "../src/state/agent-view.ts";

const cells = [
  { id: "cell-1", cell_type: "code", source: "cooling_capacity = 42" },
];
const session = {
  id: "session-1",
  title: "Cooling-system optimization",
  revision: "saved-v1",
  kernel: "idle",
  kernel_id: "kernel-2",
  cells,
  runs: [
    {
      id: "run-1",
      kernel_id: "kernel-1",
      revision: "saved-v0",
      cells: [
        {
          id: "cell-1",
          source: "cooling_capacity = 40",
          status: "completed",
          outputs: [{ text: "40" }],
        },
      ],
    },
  ],
};
test("visible unsaved notebook cells and stale output provenance survive the send envelope", () => {
  const edited = [{ ...cells[0], source: "cooling_capacity = 43 # @qfunc" }];
  const context = notebookContext("cooling", session.title, edited, session);
  const message = attachmentMessage("Explain this notebook", [
    notebookAttachment(context),
  ]);
  const decoded = splitWorkspaceContext(message);
  assert.equal(decoded.text, "Explain this notebook");
  assert.equal(decoded.context.kind, "notebook");
  assert.equal(decoded.context.name, "Cooling-system optimization.ipynb");
  assert.match(decoded.context.source, /cooling_capacity = 43/);
  assert.match(decoded.context.source, /"source_matches":false/);
  assert.match(decoded.context.source, /"kernel_matches":false/);
  assert.equal(context.dirty, true);
  edited[0].source = "changed after sending";
  assert.doesNotMatch(message, /changed after sending/);
});
test("loading notebooks never claim imported outputs were executed", () => {
  const context = notebookContext("import:abc", "Imported", [
    {
      ...cells[0],
      notebook: { outputs: [{ text: "unverified imported result" }] },
    },
  ]);
  assert.match(context.source, /not executed in this session/);
  assert.doesNotMatch(context.source, /unverified imported result/);
});
test("large unicode notebooks remain bounded with explicit omissions", () => {
  const context = notebookContext(
    "large",
    "Large",
    Array.from({ length: 1000 }, (_, i) => ({
      ...cells[0],
      id: String(i),
      source: "量".repeat(4000),
    })),
  );
  assert.ok(new TextEncoder().encode(context.source).length < 16000);
  const lines = context.source.split("\n").map((line) => JSON.parse(line));
  assert.ok(lines.at(-1).omitted_cells > 0);
  assert.equal(lines[1].source_truncated, true);
});
