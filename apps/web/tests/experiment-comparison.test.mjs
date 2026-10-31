import test from "node:test";
import assert from "node:assert/strict";
import {
  comparisonCandidates,
  compareDistributions,
  measurementCompatibility,
  circuitDifference,
  comparisonMeasurements,
} from "../src/state/experiment-comparison.ts";
import { workspaceReducer as reduce } from "../src/state/reducer.ts";
import {
  restoreWorkspace,
  persistWorkspace,
} from "../src/state/persistence.ts";
const rows = (counts, key_type = "string") =>
  Object.entries(counts).map(([state, count]) => ({ state, count, key_type }));
test("distributions normalize independent shots and retain missing states and typed keys", () => {
  const compared = compareDistributions(
    rows({ "00": 64, 11: 64 }),
    rows({ "01": 128, 10: 128 }),
  );
  assert.equal(compared.totalA, 128);
  assert.equal(compared.totalB, 256);
  assert.equal(compared.distance, 1);
  assert.equal(compared.rows.find((row) => row.state === "00").delta, -0.5);
  assert.equal(
    compareDistributions(rows({ 0: 1 }), rows({ 0: 200 })).distance,
    0,
  );
  assert.equal(compareDistributions([], rows({ 0: 2 })), null);
  assert.equal(
    compareDistributions(rows({ 1: 2 }), rows({ 1: 2 }, "integer")).rows.length,
    2,
  );
});
test("measurement mismatch is explicit, and batches are selected independently", () => {
  const a = {
    kind: "counts",
    qubits: [0, 1],
    batches: [rows({ "00": 1 }), rows({ 11: 2 })],
  };
  assert.equal(measurementCompatibility(a, a), null);
  assert.match(
    measurementCompatibility(a, { ...a, qubits: [1, 0] }),
    /qubit order/,
  );
  assert.match(
    measurementCompatibility(a, { ...a, kind: "statevector" }),
    /type/,
  );
  assert.match(measurementCompatibility(undefined, a), /Choose/);
  const batches = comparisonMeasurements({ experiment: { measurements: [a] } });
  assert.equal(batches.length, 2);
  assert.equal(batches[1].batch, 1);
  assert.equal(batches[1].rows[0].state, "11");
});
test("circuit sequence diff respects repeated gates, operands and rotation parameters", () => {
  const h = { name: "h", wires: [0] },
    cx = { name: "cx", wires: [0, 1] },
    x = { name: "x", wires: [1] };
  assert.deepEqual([...circuitDifference([h, cx], [h, cx, x]).added], [2]);
  assert.deepEqual([...circuitDifference([h, h, cx], [h, cx]).removed], [1]);
  const rotation = { name: "rx", wires: [0], params: { theta: 0.5 } };
  const changed = circuitDifference(
    [rotation],
    [{ ...rotation, params: { theta: 1 } }],
  );
  assert.equal(changed.added.size, 1);
  assert.equal(changed.removed.size, 1);
  assert.equal(circuitDifference(Array(201).fill(h), [h]).limited, true);
});
test("comparison is durable and never changes source, undo, Agent visibility or draft links", () => {
  const memory = new Map(),
    store = {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value),
    };
  const before = {
    ...restoreWorkspace(store, "model"),
    source: "unsaved Python",
    undo: ["previous"],
    agentOpen: true,
  };
  const left = "fqx-" + "a".repeat(32),
    right = "fqx-" + "b".repeat(32);
  const after = reduce(before, { type: "compare-experiments", left, right });
  assert.equal(after.source, before.source);
  assert.deepEqual(after.undo, before.undo);
  assert.equal(after.page, "jobs");
  assert.equal(after.agentOpen, true);
  persistWorkspace(store, after);
  assert.deepEqual(restoreWorkspace(store, "jobs").comparison, { left, right });
  assert.equal(
    reduce(after, { type: "compare-experiments" }).comparison,
    undefined,
  );
  memory.set(
    "fq-react-workspace-v1",
    JSON.stringify({ ...after, comparison: { left: "invalid", right } }),
  );
  assert.equal(restoreWorkspace(store, "jobs").comparison, undefined);
});

test("task comparison order survives reversed collection responses and retains run order", () => {
  const result = (id, filename, has_result = true) => ({
    id,
    filename,
    has_result,
  });
  assert.deepEqual(
    comparisonCandidates([
      {
        experiments: [
          result("b", "02-variant.fqx"),
          result("a", "01-baseline.fqx"),
          result("bad", "00-no-result.fqx", false),
        ],
      },
      {
        experiments: [
          result("d", "10.fqx"),
          result("c", "2.fqx"),
          result("a", "duplicate.fqx"),
        ],
      },
    ]),
    ["a", "b", "c", "d"],
  );
});
