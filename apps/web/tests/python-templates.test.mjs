import test from "node:test";
import assert from "node:assert/strict";
import {
  pythonExamples,
  interpretPythonPrompt,
  circuitExampleCaption,
  openCircuitExample,
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

test("circuit exercises add prediction and variation notes without changing the runnable program", () => {
  const guided = pythonExamples.filter((model) => circuitExampleCaption(model));
  assert.deepEqual(
    guided.map(({ name }) => name),
    ["Bell State", "GHZ State", "X State"],
  );
  for (const model of guided) {
    const exercise = openCircuitExample(model);
    const notes = exercise.source.slice(0, -model.source.length);
    assert.ok(exercise.source.endsWith(model.source));
    assert.match(notes, /^# Predict: /);
    assert.match(notes, /^# Try: Remove circuit\./m);
    assert.ok(
      notes
        .trimEnd()
        .split("\n")
        .every((line) => line.startsWith("# ")),
    );
    assert.equal(exercise.name, model.name);
  }
  const arithmetic = pythonExamples.at(-1);
  assert.equal(openCircuitExample(arithmetic), arithmetic);
  assert.doesNotMatch(
    interpretPythonPrompt("Bell pair").source,
    /^# Predict:/m,
  );
});
