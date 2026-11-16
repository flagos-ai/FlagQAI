import test from "node:test";
import assert from "node:assert/strict";
import { agentFailureGuidance } from "../src/state/agent-failure.ts";

test("known native failure notices show a specific next step", () => {
  const limit = agentFailureGuidance({
    kind: "notice",
    text: "turn MAX-TOKENS ",
  });
  assert.match(limit.title, /output limit/);
  assert.match(limit.summary, /Thinking also uses/);
  assert.match(limit.nextStep, /smaller step/);
  const replay = agentFailureGuidance({
    kind: "notice",
    text: 'turn error · 400 {"message":"The `reasoning_content` in the thinking mode must be passed back to the API."}',
  });
  assert.match(replay.title, /resume thinking history/);
  assert.match(replay.nextStep, /endpoint and model/);
});

test("user and model messages and unrecognized notices stay as written", () => {
  for (const kind of ["assistant", "user", "tool"])
    assert.equal(agentFailureGuidance({ kind, text: "turn max-tokens" }), null);
  for (const text of [
    "turn error · 429 rate limit",
    "The log says turn max-tokens",
  ])
    assert.equal(agentFailureGuidance({ kind: "notice", text }), null);
});
