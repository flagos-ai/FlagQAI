import test from "node:test";
import assert from "node:assert/strict";
import {
  scientificGridRecords,
  scientificSource,
} from "../src/tasks/scientific-synthesis.mjs";
import { workspaceReducer } from "../src/state/reducer.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";

test("only a completed archive bound to the exact preset run supplies grid resources", () => {
  const source = scientificSource(2);
  const pythonRun = {
    id: "grid-run",
    source_hash: "1".repeat(64),
    execution_status: "completed",
  };
  const program = {
    origin: {
      language: "python",
      source,
      run_id: pythonRun.id,
      source_hash: pythonRun.source_hash,
      execution_status: "completed",
    },
    experiment: {
      filename: "harmonic-grid-2bit.fqx",
      has_result: true,
      python_run: pythonRun,
    },
  };
  const rejected = [
    { ...program, origin: { ...program.origin, source: source + "\n# edit" } },
    { ...program, origin: { ...program.origin, execution_status: "failed" } },
    { ...program, experiment: { ...program.experiment, has_result: false } },
    {
      ...program,
      experiment: { ...program.experiment, filename: "other.fqx" },
    },
    {
      ...program,
      experiment: {
        ...program.experiment,
        python_run: { ...pythonRun, id: "other" },
      },
    },
  ];
  assert.deepEqual(
    scientificGridRecords(rejected).map((row) => row.program),
    [undefined, undefined],
  );
  assert.equal(
    scientificGridRecords([...rejected, program])[1].program,
    program,
  );
});

test("presets open as Python copies and retain an existing draft", () => {
  const state = {
    ...restoreWorkspace({ getItem: () => null }, "synthesis"),
    source: "unsaved research",
  };
  for (const bits of [1, 2]) {
    const source = scientificSource(bits);
    const next = workspaceReducer(state, {
      type: "model",
      model: { name: "Harmonic potential", source, language: "python" },
      preserveDraft: true,
    });
    assert.equal(next.source, source);
    assert.equal(next.page, "model");
    assert.ok(next.models.some((model) => model.source === state.source));
  }
  assert.throws(() => scientificSource(3));
});
