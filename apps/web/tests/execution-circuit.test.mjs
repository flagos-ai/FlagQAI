import test from "node:test";
import assert from "node:assert/strict";
import { workspaceReducer } from "../src/state/reducer.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";
import { executionSourceBlockedReason } from "../src/state/execution-source.ts";

function fixture() {
  const state = restoreWorkspace(
    { getItem: () => null, setItem: () => {} },
    "execution",
  );
  return {
    ...state,
    jobName: "Keep job name",
    shots: 1024,
    programs: [
      {
        id: "baseline",
        name: "QAOA baseline",
        source: "OPENQASM 2.0;",
        compiled: { qubits: 4, instructions: [] },
        created: 1,
      },
      {
        id: "candidate",
        name: "QAOA candidate",
        source: "OPENQASM 3.0;",
        compiled: { qubits: 4, instructions: [] },
        created: 2,
      },
    ],
  };
}
test("choosing an execution circuit preserves draft, undo, archived records and run settings", () => {
  const state = fixture();
  const next = workspaceReducer(state, {
    type: "execution-circuit",
    id: "candidate",
  });
  assert.equal(next.execution, state.programs[1]);
  for (const key of [
    "source",
    "name",
    "language",
    "undo",
    "editorLink",
    "programs",
    "shots",
    "seed",
    "jobName",
    "page",
  ])
    assert.deepEqual(next[key], state[key]);
  assert.equal(executionSourceBlockedReason(next), "");
  const draft = workspaceReducer(next, { type: "execution-circuit", id: null });
  assert.equal(draft.execution, null);
  assert.equal(draft.source, state.source);
  assert.match(executionSourceBlockedReason(draft), /Run Python in Model/);
});
test("missing circuit IDs and selection during submission cannot change execution source", () => {
  const state = fixture();
  assert.equal(
    workspaceReducer(state, { type: "execution-circuit", id: "missing" }),
    state,
  );
  const busy = { ...state, busy: true, execution: state.programs[0] };
  assert.equal(
    workspaceReducer(busy, { type: "execution-circuit", id: "candidate" }),
    busy,
  );
  assert.equal(
    workspaceReducer(busy, { type: "execution-circuit", id: null }),
    busy,
  );
  assert.equal(
    executionSourceBlockedReason({ execution: null, language: "qasm" }),
    "",
  );
});
