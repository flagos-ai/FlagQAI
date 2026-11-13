import assert from "node:assert/strict";
import test from "node:test";
import {
  circuitHierarchy,
  hierarchyOpenAtLevel,
  hierarchyIndex,
  hierarchyVisibleCoverage,
} from "../../../packages/quantum-workspace/domain/circuit-tree.mjs";
import { buildCircuitScene } from "../src/state/circuit-scene.ts";

const instructions = Array.from({ length: 81 }, (_, index) => ({
  name: index < 4 ? "h" : "cx",
  wires: index < 4 ? [index] : [index % 16, (index + 1) % 16],
}));
const flat = { instructions, groups: {} };
function coverage(root, gates) {
  const ids = gates.map((_, i) => i);
  for (const limit of [0, 1, 2, 3, 100]) {
    const open = new Set(
      [...hierarchyIndex(root)]
        .filter(([, entry]) => entry.level < limit)
        .map(([id]) => id),
    );
    const scene = buildCircuitScene(root, gates, open, (w) => w, 16);
    assert.deepEqual(hierarchyVisibleCoverage(scene.layout), ids);
  }
}

test("flat synthesized circuits have bounded gate ranges at Overview and expand without reordering", () => {
  for (const count of [0, 2, 8, 9, 81, 2000]) {
    const gates = Array.from(
      { length: count },
      (_, i) => instructions[i % instructions.length],
    );
    const root = circuitHierarchy({ instructions: gates });
    assert.equal(root.kind, "sequence");
    if (count <= 8)
      assert.equal(
        root.children.length,
        0,
        "small circuits show gates directly",
      );
    else assert(root.children.length > 1 && root.children.length <= 6);
    for (const { node } of hierarchyIndex(root).values()) {
      assert(node.children.length <= 6);
      if (node.id !== "__root__" && !node.children.length)
        assert(node.gate_count <= 8);
    }
    coverage(root, gates);
  }
});

test("explicitly named ungrouped instructions remain a real source module", () => {
  const gates = instructions.map((gate) => ({ ...gate, group: "ungrouped" }));
  const root = circuitHierarchy({
    instructions: gates,
    groups: { ungrouped: "Compiler arithmetic" },
  });
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].label, "Compiler arithmetic");
  assert.equal(root.children[0].kind, undefined);
  coverage(root, gates);
});

test("detail presets preserve coverage while ranges stay distinct from all gates", () => {
  const root = circuitHierarchy(flat);
  const overview = hierarchyOpenAtLevel(root, 1);
  const ranges = hierarchyOpenAtLevel(root, 3);
  const all = hierarchyOpenAtLevel(root, 100);
  assert.equal(overview.size, 1);
  assert(ranges.size > overview.size);
  assert(all.size > ranges.size);
  for (const open of [overview, ranges, all]) {
    const scene = buildCircuitScene(root, instructions, open, (w) => w, 16);
    assert.deepEqual(
      hierarchyVisibleCoverage(scene.layout),
      instructions.map((_, i) => i),
    );
  }
  assert.deepEqual([...hierarchyOpenAtLevel(root, 0)], ["__root__"]);
});

test("persisted ungrouped hierarchy gets the same fallback without modifying archived data", () => {
  const old = {
    id: "__root__",
    gate_indices: instructions.map((_, i) => i),
    children: [
      {
        id: "ungrouped",
        children: [],
        gate_indices: instructions.map((_, i) => i),
      },
    ],
  };
  const before = structuredClone(old);
  const root = circuitHierarchy({ ...flat, hierarchy: old });
  assert.equal(root.kind, "sequence");
  assert.deepEqual(old, before);
  assert.equal(root.children[0].label, "Gates 1–14");
  assert.deepEqual(
    root.children[0].children[0].gate_indices,
    [0, 1, 2, 3, 4, 5, 6],
  );
  coverage(root, instructions);
});

test("real named source modules remain intact, with anonymous intervals expanded in place", () => {
  const indices = instructions.map((_, i) => i);
  const main = {
    id: "main",
    label: "Arithmetic",
    children: [],
    gate_indices: indices.slice(0, 40),
  };
  const old = {
    id: "__root__",
    label: "Program",
    children: [
      main,
      { id: "ungrouped", children: [], gate_indices: indices.slice(40) },
    ],
    gate_indices: indices,
  };
  const root = circuitHierarchy({ ...flat, hierarchy: old });
  assert.deepEqual(root.children[0], main);
  assert(root.children[1].label.startsWith("Gates 41–"));
  assert.equal(root.kind, undefined);
  assert.equal(old.children.length, 2);
  coverage(root, instructions);
});

test("named instruction groups are not replaced with invented semantic phases", () => {
  const gates = instructions.map((gate, i) => ({
    ...gate,
    group: i < 4 ? "prepare" : "arithmetic",
  }));
  const root = circuitHierarchy({
    instructions: gates,
    groups: { prepare: "Uniform inputs", arithmetic: "Polynomial" },
  });
  assert.deepEqual(
    root.children.map((n) => n.label),
    ["Uniform inputs", "Polynomial"],
  );
  assert.equal(root.kind, undefined);
  coverage(root, gates);
});
