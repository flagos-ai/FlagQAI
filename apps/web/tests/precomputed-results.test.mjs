import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
test("every saved output matches the current SDK example and a normalized state or complete sample", async () => {
  const saved = JSON.parse(
    readFileSync(
      new URL("../src/data/gate-example-results.json", import.meta.url),
      "utf8",
    ),
  );
  const bundle = await build({
    stdin: {
      contents:
        'export {gateReference} from "./src/state/gate-reference"; export {flagQuantumExample} from "./src/state/flagquantum-examples";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  const { gateReference, flagQuantumExample } = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  assert.deepEqual(
    Object.keys(saved.examples).sort(),
    gateReference.map((g) => g.name).sort(),
  );
  assert.equal(saved.bitOrder, "q0_first");
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.comparisonPoint, "after_preparation_before_gate");
  for (const gate of gateReference) {
    const result = saved.examples[gate.name];
    assert.equal(
      result.source,
      flagQuantumExample(gate.name, gate.qubits, gate.parameters),
      gate.name + " stale output",
    );
    assert.equal(result.before.length, 2 ** gate.qubits);
    assert.ok(
      Math.abs(
        result.before.reduce((sum, row) => sum + row.probability, 0) - 1,
      ) < 1e-5,
    );
    for (const row of result.before)
      assert.ok(
        Math.abs(row.real ** 2 + row.imag ** 2 - row.probability) < 1e-6,
      );
    if (result.kind === "counts") {
      assert.equal(
        Object.values(result.counts).reduce((a, b) => a + b, 0),
        result.shots,
      );
      assert.equal(result.seed, 42);
    } else {
      assert.equal(result.amplitudes.length, 2 ** gate.qubits);
      assert.ok(
        Math.abs(
          result.amplitudes.reduce((sum, a) => sum + a.probability, 0) - 1,
        ) < 1e-5,
      );
      for (const row of result.amplitudes)
        assert.ok(
          Math.abs(row.real ** 2 + row.imag ** 2 - row.probability) < 1e-6,
        );
    }
  }
  assert.ok(
    saved.examples.z.before.every((row) => row.real > 0),
    "Z input must be the positive prepared superposition",
  );
  assert.ok(
    Math.abs(saved.examples.measure.before[1].probability - 0.5) < 1e-6,
  );
  for (const [gate, input] of [
    ["x", "0"],
    ["swap", "10"],
    ["ccx", "110"],
    ["cswap", "110"],
    ["ch", "10"],
    ["cu3", "10"],
  ])
    assert.ok(
      saved.examples[gate].before.find((row) => row.state === input)
        .probability > 0.99999,
      gate + " prepared input",
    );
  assert.ok(
    saved.examples.z.amplitudes[1].real < 0,
    "Z preparation exposes the negative amplitude",
  );
  for (const [gate, state] of [
    ["x", "1"],
    ["swap", "01"],
    ["ccx", "111"],
    ["cswap", "101"],
  ]) {
    assert.ok(
      saved.examples[gate].amplitudes.find((a) => a.state === state)
        .probability > 0.99999,
      gate,
    );
  }
});
