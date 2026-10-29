import assert from "node:assert/strict";
import test from "node:test";
import { workspaceReducer } from "../src/state/reducer.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
import {
  examples,
  arithmeticModel,
  interpretPrompt,
} from "../src/state/templates.ts";
import { lintOpenQASM } from "../../../packages/quantum-workspace/domain/model-lint.mjs";
import {
  circuitHierarchy,
  hierarchyLayout,
  hierarchyVisibleCoverage,
} from "../../../packages/quantum-workspace/domain/circuit-tree.mjs";

const storage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, v) => data.set(key, v),
  };
};
const compiled = {
  version: "test",
  qubits: 2,
  depth: 2,
  instructions: [
    { name: "h", wires: [0] },
    { name: "cx", wires: [0, 1] },
  ],
  gate_counts: { h: 1, cx: 1 },
};
const program = {
  id: "bell",
  name: "Bell",
  source: examples[0].source,
  compiled,
  created: 1,
};
test("program selection and execution use the selected snapshot, never overwrite draft", () => {
  let state = restoreWorkspace(storage(), "model");
  state = {
    ...state,
    name: "Draft",
    source: "draft source",
    programs: [program],
    selectedProgramId: "bell",
  };
  state = workspaceReducer(state, { type: "navigate", page: "program" });
  state = workspaceReducer(state, { type: "navigate", page: "execution" });
  assert.equal(state.execution.source, program.source);
  assert.equal(state.source, "draft source");
  state = workspaceReducer(state, { type: "use-draft" });
  assert.equal(state.execution, null);
});
test("late compilation and recovered jobs do not steal the current draft or page", () => {
  let state = {
    ...restoreWorkspace(storage(), "model"),
    source: "newer draft",
  };
  state = workspaceReducer(state, { type: "compiled", program });
  assert.equal(state.source, "newer draft");
  assert.equal(state.page, "model");
  state = workspaceReducer(state, { type: "recover-program", program });
  assert.equal(state.programs.length, 1);
});
test("legacy browser keys migrate without deleting saved models or pane sizes", () => {
  const old = storage();
  old.setItem("fq-code", "original draft");
  old.setItem("fq-name", "Original");
  old.setItem("fq-quantum-programs-v1", JSON.stringify([program]));
  old.setItem("fq-pane-layout-v1", '{"sidebar":333}');
  const state = restoreWorkspace(old, "model");
  persistWorkspace(old, state);
  assert.equal(state.source, "original draft");
  assert.equal(state.programs[0].source, program.source);
  assert.equal(old.getItem("fq-pane-layout-v1"), '{"sidebar":333}');
  const undo = workspaceReducer(
    workspaceReducer(state, { type: "edit", source: "changed" }),
    { type: "undo" },
  );
  assert.equal(undo.source, "original draft");
});
test("diagnostics identify real operands and all examples remain valid locally", () => {
  for (const model of examples)
    assert.deepEqual(
      lintOpenQASM(model.source).filter((d) => d.severity === "error"),
      [],
      model.name,
    );
  const bad = lintOpenQASM("OPENQASM 2.0;\nqreg q[2];\nh q[2];");
  assert(
    bad.some(
      (d) =>
        d.line === 3 && d.column === 3 && d.message.includes("out of range"),
    ),
  );
  assert.equal(interpretPrompt("generate a weather app"), null);
  assert(arithmeticModel(3, 2).source.includes("ccx"));
});
test("every logical gate is represented exactly once at all fold levels", () => {
  const root = circuitHierarchy(compiled);
  for (const expanded of [new Set(), new Set(["ungrouped_0"])])
    assert.deepEqual(
      hierarchyVisibleCoverage(hierarchyLayout(root, expanded)),
      [0, 1],
    );
});

test("CSV export preserves register decoding and all counts", async () => {
  const { jobCSV } = await import("../src/state/exports.ts");
  const text = jobCSV({
    id: "job",
    name: "sample",
    status: "completed",
    request: { source: "source", shots: 17, seed: 42 },
    result: {
      ...compiled,
      shots: 17,
      seed: 42,
      elapsed_seconds: 1,
      registers: [{ name: "x", wires: [0] }],
      counts: { "00": 11, 11: 6 },
      decoded: [
        { state: "00", count: 11, values: { x: 0 } },
        { state: "11", count: 6, values: { x: 1 } },
      ],
    },
  });
  assert.equal(
    text,
    "state,x,count,probability\n00,0,11,0.6470588235294118\n11,1,6,0.35294117647058826",
  );
});
