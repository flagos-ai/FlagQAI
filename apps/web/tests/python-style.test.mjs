import test from "node:test";
import assert from "node:assert/strict";
import {
  detectedPythonStyle,
  pythonStyleOverride,
} from "../src/state/python-style.ts";
import { workspaceReducer } from "../src/state/reducer.ts";
import { restoreWorkspace, workspaceBackup } from "../src/state/persistence.ts";
import catalog from "../src/data/synthesis-catalog.json" with { type: "json" };
import { backupDrafts } from "../src/state/backup-import.ts";
const initial = () => restoreWorkspace({ getItem: () => null }, "model");
test("automatic hint recognizes synth and mixed code without matching comments or strings", () => {
  for (const example of catalog.entries.filter(({ source }) => source))
    assert.equal(detectedPythonStyle(example.source), "synthesis", example.id);
  assert.equal(
    detectedPythonStyle(
      "from flagquantum import synth as compiler\np = compiler.synthesize(fn)\ncircuit.h(0)",
    ),
    "synthesis",
  );
  assert.equal(detectedPythonStyle("p = fq.synth.synthesize(fn)"), "synthesis");
  assert.equal(
    detectedPythonStyle(
      '# synth.synthesize(fn)\ns = "synth.synthesize(fn)"\ncircuit.h(0)',
    ),
    undefined,
  );
  assert.equal(
    detectedPythonStyle("import flagquantum as fq\nc = fq.Circuit(2)"),
    "gates",
  );
  assert.equal(detectedPythonStyle("print(42)"), undefined);
});
test("style survives reload per file without changing code, undo, drafts or execution", () => {
  const state = {
    ...initial(),
    source: "unsaved code",
    undo: ["old code"],
    pythonRunId: "retained-run",
  };
  const changed = workspaceReducer(state, {
    type: "python-style",
    style: "synthesis",
  });
  for (const key of ["source", "undo", "models", "pythonRunId", "editorLink"])
    assert.deepEqual(changed[key], state[key]);
  const restored = restoreWorkspace(
    {
      getItem: (key) =>
        key === "fq-react-workspace-v1" ? workspaceBackup(changed) : null,
    },
    "model",
  );
  assert.equal(pythonStyleOverride(restored), "synthesis");
  const other = workspaceReducer(changed, {
    type: "model",
    model: { name: "Other", source: "other", language: "python" },
    preserveDraft: true,
  });
  assert.equal(pythonStyleOverride(other), undefined);
  const draft = other.models.find((model) => model.source === "unsaved code");
  assert.equal(draft.pythonStyle, "synthesis");
  const reopened = workspaceReducer(other, { type: "model", model: draft });
  assert.equal(pythonStyleOverride(reopened), "synthesis");
  assert.equal(
    pythonStyleOverride(workspaceReducer(reopened, { type: "python-style" })),
    undefined,
  );
});
test("project file and standalone model preferences are independent", () => {
  const state = {
    ...initial(),
    project: { id: "p" },
    activeProjectTab: "a.py",
  };
  // Pure selector isolation does not require a project filesystem or file save.
  const changed = {
    ...state,
    pythonStyles: { '["project","p","a.py"]': "gates" },
  };
  assert.equal(pythonStyleOverride(changed), "gates");
  assert.equal(
    pythonStyleOverride({ ...changed, activeProjectTab: "b.py" }),
    undefined,
  );
  assert.equal(
    pythonStyleOverride({ ...changed, activeProjectTab: undefined }),
    undefined,
  );
});

test("saved classification is backed up without contaminating a new same-name copy", () => {
  const named = {
    ...initial(),
    name: "Experiment",
    source: "print(42)",
    pythonStyles: { '["model","Experiment"]': "gates" },
  };
  const saved = workspaceReducer(named, { type: "save" });
  assert.equal(saved.models[0].pythonStyle, "gates");
  assert.equal(backupDrafts(workspaceBackup(saved))[0].pythonStyle, "gates");
  const fresh = workspaceReducer(saved, {
    type: "model",
    model: { name: "Experiment", source: "print(5)", language: "python" },
    preserveDraft: true,
  });
  assert.equal(pythonStyleOverride(fresh), undefined);
  assert.equal(
    pythonStyleOverride(
      workspaceReducer(fresh, {
        type: "model",
        model: saved.models[0],
      }),
    ),
    "gates",
  );
});
