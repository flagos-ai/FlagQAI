import assert from "node:assert/strict";
import test from "node:test";
import { buildCircuitScene, labelWidth } from "../src/state/circuit-scene.ts";
import { hierarchyVisibleCoverage } from "../../../packages/quantum-workspace/domain/circuit-tree.mjs";

const gates = [
  { name: "h", wires: [0] },
  { name: "cx", wires: [0, 1] },
  { name: "rz", wires: [1], params: { theta: 1.23456789 } },
];
const leaf = {
  id: "main/prepare/controlled-operation",
  label: "A deliberately long controlled operation title that must fit",
  children: [],
  gate_indices: [0, 1, 2],
  wires: [0, 1],
  gate_count: 3,
  gate_counts: { h: 1, cx: 1, rz: 1 },
};
const main = {
  ...leaf,
  id: "main",
  label: "Quantum arithmetic preparation and reversible transformation",
  children: [leaf],
};
const root = { ...main, id: "__root__", label: "Program", children: [main] };
function check(item) {
  if (item.node && !item.collapsed && item.node.id !== "__root__") {
    assert(
      item.width >=
        labelWidth(
          item.node.label + " · " + item.node.gate_count + " gates",
          11,
        ) +
          54,
      "header width",
    );
    for (const child of item.children) {
      assert(child.y >= item.y + 36, "reserved header band");
      assert(
        child.y + child.height <= item.y + item.height - 18,
        "bottom padding",
      );
      assert(child.x >= item.x + 18, "left padding");
      assert(
        child.x + child.width <= item.x + item.width - 18,
        "right padding",
      );
    }
  }
  item.children.forEach(check);
}
test("nested headers, gates and captions occupy separate reserved bounds at every fold level", () => {
  for (const open of [new Set(), new Set(["main"]), new Set(["main", leaf.id])])
    for (const bus of [false, true]) {
      const scene = buildCircuitScene(
        root,
        gates,
        open,
        (w) => (bus ? 0 : w),
        bus ? 1 : 2,
        bus,
      );
      check(scene.layout);
      assert.deepEqual(hierarchyVisibleCoverage(scene.layout), [0, 1, 2]);
      assert(scene.layout.y >= 0);
      assert(scene.height >= scene.layout.y + scene.layout.height);
    }
});
test("collapsed labels wrap without losing long words or entering the fold control", () => {
  const scene = buildCircuitScene(root, gates, new Set(), (w) => w, 2);
  const module = scene.layout.children[0];
  assert(module.collapsed);
  assert.equal(
    module.labelLines.join("").replace(/\s/g, ""),
    main.label.replace(/\s/g, ""),
  );
  assert(module.labelLines.every((line) => labelWidth(line) <= 148));
  assert(module.height >= 36 + module.labelLines.length * 18 + 34);
});

test("invisible scene root reserves no header or duplicated top padding", () => {
  for (const open of [
    new Set(),
    new Set(["main"]),
    new Set(["main", leaf.id]),
  ]) {
    const scene = buildCircuitScene(root, gates, open, (w) => w, 2);
    assert.equal(scene.layout.y, 12);
    assert.equal(
      scene.layout.children[0].y,
      12,
      "first visible frame starts at the canvas top inset",
    );
  }
});
