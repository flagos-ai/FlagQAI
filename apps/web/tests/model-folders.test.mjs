import test from "node:test";
import assert from "node:assert/strict";
import {
  modelFolderTree,
  modelFolder,
  modelKey,
  normalizeModelFolder,
} from "../src/state/model-folders.ts";
import { workspaceReducer } from "../src/state/reducer.ts";
import { workspaceBackup, restoreWorkspace } from "../src/state/persistence.ts";
import { backupDrafts, mergeBackupDrafts } from "../src/state/backup-import.ts";
const fresh = () => restoreWorkspace({ getItem: () => null }, "model");
test("existing records group without changing their code or names; nested folder counts and search are accurate", () => {
  const models = [
    { name: "Draft · QAOA", source: "draft", language: "python" },
    { name: "Bell · Agent 1", source: "agent" },
    { name: "Candidate", source: "saved", folder: "Research/QAOA" },
  ];
  assert.equal(modelFolder(models[0]), "Drafts");
  assert.equal(modelFolder(models[1]), "Agent snapshots");
  const tree = modelFolderTree(models, ["Research/Empty"]);
  const research = tree.find((node) => node.path === "Research");
  assert.equal(research.count, 1);
  assert.equal(research.children.length, 2);
  assert.deepEqual(
    modelFolderTree(models, [], "research/qaoa")[0].children[0].models,
    [models[2]],
  );
  assert.equal(modelFolderTree(models, [], "absent").length, 0);
  for (const bad of ["../outside", "Research//QAOA", "/root", "a\\b", "a/./b"])
    assert.equal(normalizeModelFolder(bad), null);
});
test("moving and creating folders survive reload, keep active draft and undo, and retain saved location", () => {
  const state = {
    ...fresh(),
    name: "Candidate",
    source: "unsaved",
    undo: ["before"],
    models: [{ name: "Candidate", source: "saved", language: "python" }],
  };
  const moved = workspaceReducer(state, {
    type: "model-folder-move",
    key: modelKey(state.models[0]),
    path: "Research / QAOA",
  });
  assert.equal(moved.models[0].folder, "Research/QAOA");
  assert.equal(moved.models[0].source, "saved");
  for (const key of ["source", "undo", "editorLink", "pythonRunId"])
    assert.deepEqual(moved[key], state[key]);
  const saved = workspaceReducer(moved, { type: "save" });
  assert.equal(saved.models[0].folder, "Research/QAOA");
  const restored = restoreWorkspace(
    {
      getItem: (key) =>
        key === "fq-react-workspace-v1" ? workspaceBackup(saved) : null,
    },
    "model",
  );
  assert.equal(restored.models[0].folder, "Research/QAOA");
  assert.ok(restored.modelFolders.includes("Research/QAOA"));
  const imported = mergeBackupDrafts([], backupDrafts(workspaceBackup(saved)));
  // The current draft and its saved snapshot have different source and both survive.
  assert.ok(imported.some((model) => model.source === "unsaved"));
  assert.deepEqual(
    workspaceReducer(moved, { type: "model-folder-create", path: ".." }),
    moved,
  );
});
