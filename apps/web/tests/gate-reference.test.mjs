import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// TypeScript imports are bundled for the browser; keep this check dependency-free.
test("gate reference covers exactly the validator's supported gates and operand arities", async () => {
  const { build } = await import("esbuild");
  const bundle = await build({
    entryPoints: ["src/state/gate-reference.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const { gateReference } = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  const lint = readFileSync(
    new URL(
      "../../../packages/quantum-workspace/domain/model-lint.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const specs = Object.fromEntries(
    [
      ...lint
        .match(/const specs=\{([^}]+)\}/)[1]
        .matchAll(/(\w+):\[(\d+),(\d+)\]/g),
    ].map((m) => [m[1], [Number(m[2]), Number(m[3])]]),
  );
  assert.deepEqual(
    gateReference
      .filter((g) => g.name !== "measure")
      .map((g) => g.name)
      .sort(),
    Object.keys(specs).sort(),
  );
  assert.equal(
    new Set(gateReference.map((g) => g.name)).size,
    gateReference.length,
  );
  for (const gate of gateReference) {
    if (gate.name !== "measure") {
      assert.equal(gate.qubits, specs[gate.name][0], gate.name);
      assert.equal(gate.parameters.length, specs[gate.name][1], gate.name);
    }
    assert.ok(
      gate.description && gate.math && gate.example.endsWith(";"),
      gate.name,
    );
  }
});
