import test from "node:test";
import assert from "node:assert/strict";
import { transcriptTurns, workDuration } from "../src/state/agent-turns.ts";
import { emptyAgentView } from "../src/state/agent-view.ts";
const view = (rows, working = false) => ({
  ...emptyAgentView(),
  rows: Object.fromEntries(rows.map((row) => [row.id, row])),
  order: rows.map((row) => row.id),
  working,
});
const row = (id, kind, extra = {}) => ({
  id,
  kind,
  text: String(id),
  ...extra,
});
test("completed turns fold intermediate output while keeping final answers and notices visible", () => {
  const turns = transcriptTurns(
    view(
      [
        row(1, "user"),
        row(2, "assistant"),
        row(3, "reasoning"),
        row(4, "tool"),
        row(5, "notice"),
        row(6, "assistant"),
        row(7, "turn-summary", {
          turnUsage: { durationMs: 73000, outcome: "completed" },
        }),
        row(8, "user"),
        row(9, "tool"),
        row(10, "assistant"),
      ],
      true,
    ),
  );
  assert.deepEqual(
    turns[0].work.map((r) => r.id),
    [2, 3, 4],
  );
  assert.deepEqual(
    turns[0].visible.map((r) => r.id),
    [1, 5, 6, 7],
  );
  assert.equal(turns[0].active, false);
  assert.equal(turns[0].toolCount, 1);
  assert.equal(workDuration(turns[0].durationMs), "1m 13s");
  assert.equal(turns[1].active, true);
  assert.deepEqual(
    turns[1].visible.map((r) => r.id),
    [8, 10],
  );
});
test("plain answers stay untouched; interrupted work does not invent a final reply or duration", () => {
  const plain = transcriptTurns(view([row(1, "user"), row(2, "assistant")]));
  assert.equal(plain[0].work.length, 0);
  assert.deepEqual(
    plain[0].visible.map((r) => r.id),
    [1, 2],
  );
  const stopped = transcriptTurns(
    view([
      row(1, "user"),
      row(2, "assistant"),
      row(3, "tool"),
      row(4, "interrupt"),
    ]),
  );
  assert.deepEqual(
    stopped[0].work.map((r) => r.id),
    [2, 3],
  );
  assert.deepEqual(
    stopped[0].visible.map((r) => r.id),
    [1, 4],
  );
  assert.equal(workDuration(stopped[0].durationMs), "");
  assert.equal(workDuration(NaN), "");
  assert.equal(workDuration(800), "1s");
});

test("native turn timestamps produce stable elapsed time through history replay", async () => {
  const { applyAgentRecord } = await import("../src/state/agent-view.ts");
  let state = emptyAgentView();
  const events = [
    { type: "user.message", seq: 12 },
    { type: "turn.start", turn: 1, time: 1000 },
    { type: "turn.end", turn: 1, time: 66000, reason: { kind: "completed" } },
    {
      type: "session.view",
      reset: true,
      working: false,
      order: [1, 2, 3],
      rows: [row(1, "user", { seq: 12 }), row(2, "tool"), row(3, "assistant")],
    },
  ];
  events.forEach((event, index) => {
    state = applyAgentRecord(state, {
      id: index + 1,
      session: "test",
      event,
      meta: { wake: "sync", replay: true },
    });
  });
  assert.equal(workDuration(transcriptTurns(state)[0].durationMs), "1m 5s");
  assert.equal(transcriptTurns(state)[0].outcome, "completed");
});
