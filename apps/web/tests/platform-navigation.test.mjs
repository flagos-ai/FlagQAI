import test from "node:test";
import assert from "node:assert/strict";
import {
  platformNavigation,
  shouldFollowTarget,
} from "../src/state/platform-navigation.ts";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";
import { restoreWorkspace, workspaceBackup } from "../src/state/persistence.ts";
import { backupDrafts } from "../src/state/backup-import.ts";
const id = "fqx-" + "f".repeat(32);
const record = {
  id,
  program: {
    id,
    name: "New Bell",
    source: "qasm snapshot",
    compiled: { qubits: 2, instructions: [] },
    created: 1,
  },
  job: { id, name: "New Bell", status: "completed" },
};
const focus = (page) => ({
  operation: "focus",
  result: {
    page,
    ...(page === "program" ? { program_id: id } : { job_id: id }),
  },
});
const state = () => ({
  ...restoreWorkspace({ getItem: () => null }, "execution"),
  source: "unsaved Python draft",
  language: "python",
  undo: ["previous"],
});
test("only the visible comparison blocks automatic Python run navigation", () => {
  const comparison = { left: id, right: "other" };
  const run = {
    operation: "python.run",
    result: { python_run: { id: "running" } },
  };
  const create = {
    operation: "model.create",
    result: { file: { id: "new.py" } },
  };
  assert.equal(shouldFollowTarget({ page: "jobs", comparison }, run), false);
  assert.equal(shouldFollowTarget({ page: "jobs", comparison }, create), true);
  assert.equal(shouldFollowTarget({ page: "jobs" }, run), true);
  assert.equal(
    shouldFollowTarget({ page: "execution", comparison }, run),
    true,
  );
});
test("structured comparison resolves both saved records and preserves the unsaved editor", async () => {
  const other = "fqx-" + "a".repeat(32);
  const before = state();
  const changes = await platformNavigation(
    {
      operation: "experiment.compare",
      result: { page: "jobs", comparison: { left: id, right: other } },
    },
    before,
    {
      experiment: async (key) => ({
        ...record,
        id: key,
        program: { ...record.program, id: key },
        job: { ...record.job, id: key },
      }),
      job: async () => {
        throw Error("Must use actual saved experiments");
      },
    },
  );
  const after = changes.reduce(reduce, before);
  assert.equal(after.source, before.source);
  assert.deepEqual(after.comparison, { left: id, right: other });
  assert.equal(after.page, "jobs");
  await assert.rejects(
    platformNavigation(
      { result: { comparison: { left: id, right: other } } },
      before,
      { experiment: async () => ({ ...record, job: null }) },
    ),
    /saved results/,
  );
});
test("focus resolves a new archive before selecting its circuit or result from Execution", async () => {
  for (const page of ["program", "jobs"]) {
    const before = state();
    let reads = 0;
    const changes = await platformNavigation(focus(page), before, {
      experiment: async (key) => {
        assert.equal(key, id);
        reads++;
        return record;
      },
      job: async () => {
        throw Error("Must read archive");
      },
    });
    const after = changes.reduce(reduce, before);
    assert.equal(reads, 1);
    assert.equal(after.page, page);
    assert.equal(after.source, before.source);
    assert.deepEqual(after.undo, before.undo);
    assert.equal(after.programs.find((p) => p.id === id).name, "New Bell");
    assert.equal(after.jobs.find((j) => j.id === id).status, "completed");
    assert.equal(
      page === "program" ? after.selectedProgramId : after.selectedJobId,
      id,
    );
  }
});
test("already-loaded focus avoids redundant archive loads; failed loads cannot produce partial navigation", async () => {
  const before = reduce(state(), { type: "import-experiment", record });
  const readers = {
    experiment: async () => {
      throw Error("Must not read");
    },
    job: async () => {
      throw Error("Must not read");
    },
  };
  assert.equal(
    (await platformNavigation(focus("program"), before, readers)).reduce(
      reduce,
      before,
    ).page,
    "program",
  );
  await assert.rejects(
    platformNavigation(focus("jobs"), state(), readers),
    /Must not read/,
  );
  await assert.rejects(
    platformNavigation(focus("program"), state(), {
      ...readers,
      experiment: async () => ({
        ...record,
        program: { ...record.program, id: "wrong" },
      }),
    }),
    /navigation target/,
  );
});

const createdModel = (name, source, number = "1") => ({
  operation: "model.create",
  result: {
    name,
    file: {
      id: number.repeat(32) + ".py",
      source,
      revision: "v1",
      path: "models/" + name + ".py",
    },
  },
});
const unusedReaders = {
  experiment: async () => {
    throw Error("Unexpected archive read");
  },
  job: async () => {
    throw Error("Unexpected job read");
  },
};

test("a followed model can return to the first draft after refresh without losing later manual edits", async () => {
  const before = {
    ...state(),
    name: "Local experiment",
    pythonStyles: { '["model","Local experiment"]': "synthesis" },
    editorLink: {
      id: "3".repeat(32) + ".py",
      modelName: "Local experiment",
      path: "models/local.py",
      base: "original linked file",
      revision: "local-v1",
    },
  };
  const open = async (action, current, automatic) =>
    (
      await platformNavigation(action, current, unusedReaders, automatic)
    ).reduce(reduce, current);
  const action = createdModel("Agent first", "first source");
  assert.equal((await open(action, before, false)).agentDraft, undefined);
  const first = await open(action, before, true);
  assert.equal(first.source, "first source");
  assert.equal(first.agentDraft.source, before.source);
  const second = await open(
    createdModel("Agent second", "second source", "2"),
    first,
    true,
  );
  assert.equal(second.agentDraft.source, before.source);
  const edited = reduce(second, { type: "edit", source: "my variant notes" });
  const snapshot = workspaceBackup(edited);
  assert.ok(
    backupDrafts(snapshot).some(({ source }) => source === before.source),
  );
  const restored = restoreWorkspace(
    { getItem: (key) => (key === "fq-react-workspace-v1" ? snapshot : null) },
    "model",
  );
  const returned = reduce(restored, { type: "return-agent-draft" });
  for (const field of [
    "name",
    "source",
    "language",
    "undo",
    "editorLink",
    "pythonStyles",
  ])
    assert.deepEqual(returned[field], before[field], field);
  assert.equal(returned.agentDraft, undefined);
  assert.ok(
    returned.models.some(({ source }) => source === "my variant notes"),
  );
});

test("returning to a project tab retains disk changes that arrived while following Agent code", async () => {
  const project = {
    id: "project",
    name: "Project",
    root: "/tmp/work",
    path: "work",
  };
  const file = {
    id: "project-file",
    path: "main.py",
    workspace_path: "/tmp/work/main.py",
    source: "on disk",
    revision: "v1",
    project: { id: project.id, path: "main.py" },
  };
  let current = reduce(state(), { type: "project-open-file", project, file });
  current = reduce(current, { type: "edit", source: "my project changes" });
  const changes = await platformNavigation(
    createdModel("Agent experiment", "Agent code"),
    current,
    unusedReaders,
    true,
  );
  current = changes.reduce(reduce, current);
  assert.equal(current.activeProjectTab, undefined);
  current = reduce(current, {
    type: "project-file-update",
    file: { ...file, source: "updated on disk", revision: "v2" },
  });
  const snapshot = workspaceBackup(current);
  current = restoreWorkspace(
    { getItem: (key) => (key === "fq-react-workspace-v1" ? snapshot : null) },
    "model",
  );
  current = reduce(current, { type: "return-agent-draft" });
  assert.equal(current.activeProjectTab, file.id);
  assert.equal(current.source, "my project changes");
  assert.deepEqual(current.editorLink.incoming, {
    source: "updated on disk",
    revision: "v2",
  });
  assert.deepEqual(current.undo, ["on disk"]);
});
