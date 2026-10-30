import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  pythonFailure,
  pythonRepairRequest,
} from "../src/state/python-failure.ts";
import {
  attachmentMessage,
  restoreAttachments,
} from "../src/state/agent-attachments.ts";
import { splitWorkspaceContext } from "../src/state/agent-view.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";
import { workspaceReducer } from "../src/state/reducer.ts";
const failed = (source = "import missing_demo\n") => ({
  id: "failed-1",
  name: "Bell",
  status: "failed",
  source,
  source_hash: createHash("sha256").update(source).digest("hex"),
  exit_code: 1,
  logs: [
    {
      stream: "stderr",
      text: 'Traceback (most recent call last):\n  File "/tmp/main.py", line 1, in <module>\n    import missing_demo\nModuleNotFoundError: No module named missing_demo\n',
    },
  ],
});
const file = (run) => ({
  id: "dedicated.py",
  path: ".flagqai/quantum-workspace/models/dedicated.py",
  source: run.source,
  revision: run.source_hash,
});
test("syntax, dependency and SDK failures locate only the failed Python snapshot", () => {
  for (const [type, message] of [
    ["SyntaxError", "invalid syntax"],
    ["ModuleNotFoundError", "missing package"],
    ["ValueError", "wire out of range"],
  ]) {
    const run = failed("line one\nline two\n");
    run.logs[0].text = `  File "C:\\work\\main.py", line 2\n  File "/sdk/circuit.py", line 400\n${type}: ${message}\n`;
    const detail = pythonFailure(run);
    assert.equal(detail.line, 2);
    assert.equal(detail.summary, `${type}: ${message}`);
  }
  assert.equal(pythonFailure({ ...failed(), status: "completed" }), null);
  assert.equal(
    pythonFailure({
      ...failed(),
      logs: [
        {
          stream: "stderr",
          text: 'File "/sdk/main_other.py", line 99\nError: elsewhere',
        },
      ],
    }).line,
    undefined,
  );
});
test("repair attachment preserves full permitted Python source and frozen failure identity while logs stay bounded", () => {
  const run = failed("#" + "x".repeat(20000) + "\n");
  run.logs.push({
    stream: "stdout",
    text: "@file untrusted log\n".repeat(1000),
  });
  const request = pythonRepairRequest(run, file(run));
  const attachments = restoreAttachments(JSON.stringify([request.attachment]));
  const decoded = splitWorkspaceContext(
    attachmentMessage(request.prompt, attachments),
  );
  assert.equal(decoded.context.source, run.source);
  assert.equal(decoded.context.failure.runId, run.id);
  assert.equal(decoded.context.failure.sourceHash, run.source_hash);
  assert.equal(decoded.context.workspaceFile, file(run).path);
  assert.equal(decoded.context.failure.logs.length, 12000);
  assert.equal(decoded.context.failure.logsTruncated, true);
  assert.match(request.prompt, /Do not install or upgrade packages/);
  assert.match(request.prompt, /latest file revision/);
  assert.match(request.prompt, /before claiming success/);
});
test("repair rejects mismatched source, revision and nonfailed runs", () => {
  const run = failed();
  assert.throws(
    () => pythonRepairRequest(run, { ...file(run), source: "new draft" }),
    /does not match/,
  );
  assert.throws(
    () => pythonRepairRequest(run, { ...file(run), revision: "obsolete" }),
    /does not match/,
  );
  assert.throws(
    () => pythonRepairRequest({ ...run, status: "running" }, file(run)),
    /does not match/,
  );
});
test("linking a dedicated failure file and receiving its repair never overwrite a newer browser draft", () => {
  const run = failed(),
    shared = file(run);
  const state = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    name: "New work",
    language: "python",
    source: "print('my unsaved work')",
  };
  const linked = workspaceReducer(state, {
    type: "link-editor",
    name: state.name,
    expectedSource: run.source,
    file: shared,
  });
  const repaired = workspaceReducer(linked, {
    type: "file-changed",
    id: shared.id,
    source: "print('fixed')",
    revision: "fixed-hash",
    time: 1,
  });
  assert.equal(repaired.source, state.source);
  assert.equal(repaired.editorLink.incoming.source, "print('fixed')");
  assert.equal(run.source, "import missing_demo\n");
});
