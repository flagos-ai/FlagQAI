import test from "node:test";
import assert from "node:assert/strict";
import { researchTurnsFromProgress } from "../src/state/research-turns.ts";
test("console and transcript share exact native question boundaries without treating UI candidates as Agent runs", () => {
  const turns = [
    {
      rows: [{ kind: "user", text: "Solve the five-node cycle", seq: 10 }],
      active: false,
      outcome: "completed",
    },
    {
      rows: [{ kind: "user", text: "Another task", seq: 30 }],
      active: false,
      outcome: "completed",
    },
  ];
  const actions = [
    {
      origin: "agent",
      turn_seq: 10,
      result: { python_run: { id: "baseline" } },
    },
    { origin: "ui", turn_seq: 20, result: { python_run: { id: "reviewed" } } },
    {
      origin: "agent",
      turn_seq: 30,
      result: { python_run: { id: "different-task" } },
    },
  ];
  const result = researchTurnsFromProgress(turns, actions);
  assert.equal(result[0].goal, "Solve the five-node cycle");
  assert.deepEqual(result[0].runs, ["baseline"]);
  assert.deepEqual(result[0].candidates, ["reviewed"]);
  assert.deepEqual(result[1].runs, ["different-task"]);
});
