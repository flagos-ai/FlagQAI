import test from "node:test";
import assert from "node:assert/strict";
import { workspaceReducer } from "../src/state/reducer.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
import {
  MAX_EXPERIMENT_BYTES,
  importExperiment,
} from "../src/api/experiments.ts";
const record = {
  id: "fqx-" + "1".repeat(32),
  program: {
    id: "fqx-" + "1".repeat(32),
    name: "Bell",
    source: "exported QASM",
    compiled: { qubits: 2, instructions: [] },
    created: 1,
    experiment: {
      id: "fqx-" + "1".repeat(32),
      has_result: true,
      measurements: [],
    },
  },
  job: {
    id: "fqx-" + "1".repeat(32),
    name: "Bell",
    status: "completed",
    experiment: { id: "fqx-" + "1".repeat(32) },
  },
};
test("opening an experiment preserves dirty Python draft, links and undo history", () => {
  const initial = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    source: "unsaved Python edits",
    language: "python",
    undo: ["previous code"],
    editorLink: { id: "shared.py", base: "old code" },
  };
  const state = workspaceReducer(initial, {
    type: "import-experiment",
    record,
    open: true,
  });
  for (const key of [
    "source",
    "name",
    "language",
    "editorLink",
    "undo",
    "languageDrafts",
    "models",
  ])
    assert.deepEqual(state[key], initial[key]);
  assert.equal(state.page, "program");
  assert.equal(state.selectedProgramId, record.id);
  assert.equal(state.selectedJobId, record.id);
  assert.equal(state.jobs[0].experiment.id, record.id);
});
test("archive restoration does not navigate or replace a newly selected live result", () => {
  const initial = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    selectedJobId: "live-job",
    selectedProgramId: "live-program",
    programs: [{ ...record.program, id: "live-program" }],
  };
  const state = workspaceReducer(initial, {
    type: "import-experiment",
    record,
  });
  assert.equal(state.page, "model");
  assert.equal(state.selectedJobId, "live-job");
  assert.equal(state.selectedProgramId, "live-program");
  assert.equal(
    workspaceReducer(state, { type: "import-experiment", record }).programs
      .length,
    2,
  );
});
test("program-only archives have no fabricated job and retain provenance after local restore", () => {
  const data = new Map(),
    storage = {
      getItem: (key) => data.get(key),
      setItem: (key, value) => data.set(key, value),
    };
  const state = workspaceReducer(restoreWorkspace(storage, "model"), {
    type: "import-experiment",
    record: {
      id: record.id,
      program: {
        ...record.program,
        experiment: { ...record.program.experiment, has_result: false },
      },
    },
    open: true,
  });
  assert.equal(state.jobs.length, 0);
  persistWorkspace(storage, state);
  const restored = restoreWorkspace(storage, "program");
  assert.equal(
    restored.programs.length,
    0,
    "large archive data stays in backend storage, not draft storage",
  );
  assert.equal(restored.selectedProgramId, record.id);
  const hydrated = workspaceReducer(restored, {
    type: "import-experiment",
    record: {
      id: record.id,
      program: {
        ...record.program,
        experiment: { ...record.program.experiment, has_result: false },
      },
    },
  });
  assert.equal(hydrated.programs[0].experiment.has_result, false);
});
test("oversized or incorrect imports fail before any network request", async () => {
  for (const file of [
    { name: "bad.py", size: 1 },
    { name: "large.fqx", size: MAX_EXPERIMENT_BYTES + 1 },
  ])
    await assert.rejects(importExperiment(file), /16 MiB/);
});

test("background recovery cannot evict the selected imported circuit from a full snapshot list", () => {
  const programs = [
    record.program,
    ...Array.from({ length: 7 }, (_, i) => ({
      ...record.program,
      id: `other-${i}`,
      source: `source-${i}`,
    })),
  ];
  const state = {
    ...restoreWorkspace({ getItem: () => null }, "program"),
    programs,
    selectedProgramId: record.id,
  };
  const recovered = workspaceReducer(state, {
    type: "recover-program",
    program: { ...record.program, id: "old-job", source: "old source" },
  });
  assert.equal(recovered.programs.length, 8);
  assert.equal(recovered.programs[0].id, record.id);
  const background = workspaceReducer(state, {
    type: "import-experiment",
    record: { ...record, program: { ...record.program, id: "old-archive" } },
  });
  assert.equal(background.programs[0].id, "old-archive");
  assert.ok(background.programs.some((p) => p.id === record.id));
  assert.equal(background.selectedProgramId, record.id);
});
test("refresh remembers the selected saved result", () => {
  const data = new Map(),
    storage = {
      getItem: (key) => data.get(key),
      setItem: (key, value) => data.set(key, value),
    };
  const state = workspaceReducer(restoreWorkspace(storage, "model"), {
    type: "import-experiment",
    record,
    open: true,
  });
  persistWorkspace(storage, state);
  assert.equal(restoreWorkspace(storage, "jobs").selectedJobId, record.id);
});

test("automatic artifacts appear at the top of a full Quantum list without changing the selected circuit or draft", () => {
  const programs = Array.from({ length: 8 }, (_, i) => ({
    ...record.program,
    id: "old-" + i,
  }));
  const initial = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    programs,
    selectedProgramId: "old-7",
    source: "unsaved draft",
    page: "model",
  };
  const next = workspaceReducer(initial, { type: "import-experiment", record });
  assert.equal(next.programs.length, 8);
  assert.equal(next.programs[0].id, record.id);
  assert.ok(next.programs.some((p) => p.id === "old-7"));
  assert.equal(next.selectedProgramId, "old-7");
  assert.equal(next.page, "model");
  assert.equal(next.source, "unsaved draft");
  assert.ok(next.jobs.some((j) => j.id === record.id));
  const repeated = workspaceReducer(next, {
    type: "import-experiment",
    record,
  });
  assert.equal(repeated.programs.filter((p) => p.id === record.id).length, 1);
});

test("opening Quantum falls back to the newest available circuit if the restored selection is unavailable", () => {
  const state = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    selectedProgramId: "missing-archive",
    programs: [record.program],
    source: "draft",
  };
  const next = workspaceReducer(state, { type: "navigate", page: "program" });
  assert.equal(next.selectedProgramId, record.id);
  assert.equal(next.source, "draft");
});

test("background archive recovery keeps newest snapshots first", () => {
  let state = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    selectedProgramId: null,
    programs: [],
  };
  for (const created of [30, 10, 20]) {
    const program = { ...record.program, id: `file-${created}`, created };
    state = workspaceReducer(state, {
      type: "import-experiment",
      record: { ...record, program },
    });
  }
  assert.deepEqual(
    state.programs.map((p) => p.created),
    [30, 20, 10],
  );
  assert.equal(state.selectedProgramId, "file-30");
});

test("archive hydration restores an older selected circuit atomically, even beyond the recent list cap", () => {
  const records = Array.from({ length: 10 }, (_, i) => ({
    ...record,
    id: `archive-${i}`,
    program: { ...record.program, id: `archive-${i}`, created: 100 - i },
  }));
  const state = {
    ...restoreWorkspace({ getItem: () => null }, "program"),
    programs: [],
    selectedProgramId: "archive-9",
    source: "new unsaved source",
    pythonRunId: "latest-run",
  };
  // The run poll may finish before archive hydration; it must not steal selection.
  const polled = workspaceReducer(state, {
    type: "import-experiment",
    record: records[0],
  });
  assert.equal(polled.selectedProgramId, "archive-9");
  const next = workspaceReducer(polled, {
    type: "restore-experiments",
    records,
  });
  assert.equal(next.selectedProgramId, "archive-9");
  assert.ok(next.programs.some((p) => p.id === "archive-9"));
  assert.equal(next.programs[0].id, "archive-0");
  assert.equal(next.programs.length, 8);
  assert.equal(next.source, state.source);
  assert.equal(next.pythonRunId, state.pythonRunId);
  assert.equal(next.page, "program");
});
