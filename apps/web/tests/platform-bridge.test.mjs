import test from "node:test";
import assert from "node:assert/strict";
import { workspaceReducer } from "../src/state/reducer.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";
import {
  platformMessage,
  attachmentMessage,
} from "../src/state/agent-attachments.ts";
import { splitWorkspaceContext } from "../src/state/agent-view.ts";
const initial = () => restoreWorkspace({ getItem: () => null }, "model");
test("new Agent resources are imported without replacing the browser draft or selecting a page", () => {
  const state = { ...initial(), source: "unsaved draft", name: "My draft" };
  const next = workspaceReducer(state, {
    type: "add-agent-model",
    model: { name: "Bell", source: "OPENQASM 2.0;" },
  });
  assert.equal(next.source, state.source);
  assert.equal(next.page, "model");
  assert.equal(next.models[0].name, "Bell");
  const duplicate = workspaceReducer(next, {
    type: "add-agent-model",
    model: { name: "Bell", source: "OPENQASM 3.0;" },
  });
  assert.equal(
    new Set(duplicate.models.map((model) => model.name)).size,
    duplicate.models.length,
  );
});
test("explicit model navigation retains the old unsaved draft as a recoverable model", () => {
  const state = { ...initial(), source: "unsaved draft", name: "My draft" };
  const file = {
    id: "file-1",
    path: ".flagqai/quantum-workspace/models/file.qasm",
    source: "OPENQASM 2.0;",
    revision: "rev",
  };
  const next = workspaceReducer(state, {
    type: "open-agent-model",
    model: { name: "Bell", source: file.source },
    file,
  });
  assert.equal(next.source, file.source);
  assert.equal(next.editorLink.id, file.id);
  assert.ok(next.models.some((model) => model.source === state.source));
});
test("action job updates merge rather than discard unrelated jobs", () => {
  const state = {
    ...initial(),
    jobs: [{ id: "old", name: "Old", status: "completed" }],
    selectedJobId: "old",
  };
  const next = workspaceReducer(state, {
    type: "merge-jobs",
    jobs: [{ id: "new", name: "New", status: "running" }],
  });
  assert.equal(next.jobs.length, 2);
  assert.equal(next.selectedJobId, "old");
});
test("light workbench controls reach the Agent without leaking into visible question or copy text", () => {
  const text = platformMessage(
    attachmentMessage("Explain", [
      {
        id: "source",
        name: "Model",
        kind: "model",
        source: "// @register x 0 1",
      },
    ]),
    {
      schema: "flagqai.workspace-controls.v1",
      command: ["python3", "platform.py"],
      dirty: true,
    },
  );
  const content = splitWorkspaceContext(text);
  assert.equal(content.text, "Explain");
  assert.equal(content.context.source, "// @register x 0 1");
  assert.equal(
    splitWorkspaceContext(
      platformMessage("Question", {
        schema: "flagqai.workspace-controls.v1",
        command: [],
      }),
    ).text,
    "Question",
  );
  assert.equal(
    splitWorkspaceContext(
      "Question\n\n<workspace_controls>\n{}\n</workspace_controls>",
    ).text,
    "Question\n\n<workspace_controls>\n{}\n</workspace_controls>",
  );
});

test("Agent compilation keeps distinct versioned artifacts even when source matches an older compile", () => {
  const older = {
    id: "old",
    name: "Model",
    source: "same source",
    compiled: { version: "old" },
    created: 1,
  };
  const newer = {
    ...older,
    id: "new",
    compiled: { version: "new" },
    created: 2,
  };
  const state = {
    ...initial(),
    programs: [older],
    selectedProgramId: "old",
    source: "unsaved draft",
  };
  const next = workspaceReducer(state, {
    type: "import-agent-program",
    program: newer,
  });
  assert.equal(next.programs.length, 2);
  assert.equal(next.selectedProgramId, "old");
  assert.equal(next.source, state.source);
  assert.equal(next.page, state.page);
  assert.equal(
    workspaceReducer(next, { type: "program", id: "new" }).selectedProgramId,
    "new",
  );
});
