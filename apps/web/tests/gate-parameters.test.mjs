import test from "node:test";
import assert from "node:assert/strict";
import {
  parameterValue,
  gateParameterLabel,
  gateCaption,
  labelWidth,
  buildCircuitScene,
} from "../src/state/circuit-scene.ts";
test("angle labels recognize pi fractions without losing exact values or wrapping phase", () => {
  assert.equal(parameterValue(Math.PI / 2), "π/2");
  assert.equal(parameterValue(-Math.PI / 4), "−π/4");
  assert.equal(parameterValue(3 * Math.PI), "3π");
  assert.equal(parameterValue(0), "0");
  assert.equal(parameterValue(0.37), "0.37 rad");
  assert.equal(parameterValue(1e-12), "1e-12 rad");
  assert.equal(parameterValue("theta + beta"), "theta + beta");
  assert.equal(
    gateCaption({ params: { theta: 1.5707963267948966 } }),
    "theta=1.5707963267948966",
  );
});
test("captions stay compact and gate geometry reserves separate caption and bus bands", () => {
  const gate = {
    name: "u3",
    wires: [0],
    params: { theta: Math.PI / 2, phi: 0, lambda: -Math.PI / 4 },
  };
  assert.equal(gateParameterLabel(gate), "(π/2, 0, −π/4)");
  const verbose = {
    ...gate,
    params: {
      theta: "theta + a_long_expression",
      phi: "beta + another_expression",
      lambda: "gamma",
    },
  };
  assert.equal(gateParameterLabel(verbose), "3 params");
  assert.ok(
    labelWidth(
      gateParameterLabel({
        ...gate,
        params: { theta: "a_long_symbolic_expression + beta" },
      }),
      10,
    ) <= 88,
  );
  for (const bus of [false, true]) {
    const root = {
      id: "__root__",
      label: "Program",
      children: [],
      gate_indices: [0],
      wires: [0],
      gate_count: 1,
    };
    const scene = buildCircuitScene(
      root,
      [gate],
      new Set(["__root__"]),
      () => 0,
      1,
      bus,
    );
    const item = scene.layout.children[0];
    const captionY = scene.wireY(0) + (bus ? 52 : 35);
    assert.ok(
      captionY + 3 <= item.y + item.height,
      "caption descender is inside allocated bounds",
    );
    assert.ok(item.width >= labelWidth(gateParameterLabel(gate), 10) + 24);
    assert.ok(
      captionY + 3 < scene.wireY(0) + scene.rowGap - 18,
      "next-row gate cannot obscure caption",
    );
  }
});
