import test from "node:test";
import assert from "node:assert/strict";
import {
  pythonExamples,
  interpretPythonPrompt,
} from "../src/state/python-templates.ts";
import { workspaceReducer } from "../src/state/reducer.ts";
import { restoreWorkspace } from "../src/state/persistence.ts";

test("every library example and generated template opens as runnable Python and retains the draft", () => {
  const state = {
    ...restoreWorkspace({ getItem: () => null }, "model"),
    source: "my unsaved Python",
  };
  const candidates = [
    ...pythonExamples,
    ...["Bell pair", "GHZ state", "Quantum arithmetic: 7*x + 3"].map(
      interpretPythonPrompt,
    ),
  ];
  assert.equal(pythonExamples.length, 4);
  for (const model of candidates) {
    assert.equal(model.language, "python");
    assert.match(
      model.source,
      /^import flagquantum as fq\n\ncircuit = fq.Circuit\(/,
    );
    assert.match(
      model.source,
      /fq.save\("(?:bell|ghz|x-state|arithmetic-[a-z0-9-]+)\.fqx", result.plan, result=result\)/,
    );
    assert.doesNotMatch(model.source, /OPENQASM|flagquantum_web|publish\(/);
    const next = workspaceReducer(state, {
      type: "model",
      model,
      preserveDraft: true,
    });
    assert.equal(next.language, "python");
    assert.equal(next.source, model.source);
    assert.ok(next.models.some((m) => m.source === state.source));
  }
  assert.equal(interpretPythonPrompt("unsupported request"), null);
});

test("built-in experiment filenames are descriptive and distinct", () => {
  assert.deepEqual(
    pythonExamples.map((m) => m.source.match(/fq.save\("([^"]+)"/)[1]),
    ["bell.fqx", "ghz.fqx", "x-state.fqx", "arithmetic-3x-plus-2.fqx"],
  );
});
