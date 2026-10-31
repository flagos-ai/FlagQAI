import test from "node:test";
import assert from "node:assert/strict";
import { platformNavigation } from "../src/state/platform-navigation.ts";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";
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
