import test from "node:test";
import assert from "node:assert/strict";
import { contextUsage } from "../src/state/agent-context.ts";
import { applyAgentRecord, emptyAgentView } from "../src/state/agent-view.ts";
test("ctx consumes native occupancy, not accumulated billed tokens, and clears absent snapshots", () => {
  let view = applyAgentRecord(emptyAgentView(), {
    id: 1,
    event: {
      type: "session.view",
      reset: true,
      rows: [],
      order: [],
      working: false,
      contextWindow: 128000,
      tokens: { input: 900000, output: 300000 },
      context: {
        compactSupported: false,
        occupancy: { usedTokens: 24800, source: "backend" },
      },
    },
  });
  assert.equal(contextUsage(view).percent, 19);
  assert.equal(contextUsage(view).used, 24800);
  view = applyAgentRecord(view, {
    id: 2,
    event: {
      type: "session.view",
      reset: false,
      rows: [],
      order: [],
      working: false,
    },
  });
  assert.equal(contextUsage(view).percent, undefined);
  assert.equal(contextUsage(view).used, undefined);
});
test("ctx distinguishes unknown capacity, zero, sampled readings, overflow and compaction", () => {
  assert.equal(contextUsage({}).percent, undefined);
  const make = (usedTokens, contextWindow, source = "projection") => ({
    context: { occupancy: { usedTokens, contextWindow, source } },
  });
  assert.equal(contextUsage(make(0, 128000)).percent, 0);
  assert.equal(contextUsage(make(450, undefined)).used, 450);
  assert.equal(contextUsage(make(450, undefined)).percent, undefined);
  assert.equal(contextUsage(make(1200, 1000)).percent, 120);
  assert.equal(contextUsage(make(1200, 1000)).fill, 100);
  assert.equal(contextUsage(make(200, 1000, "sample")).sampled, true);
  for (const used of [NaN, Infinity, -1])
    assert.equal(contextUsage(make(used, 1000)).percent, undefined);
  for (const capacity of [NaN, Infinity, 0, -1])
    assert.equal(contextUsage(make(100, capacity)).percent, undefined);
  assert.equal(
    contextUsage({ context: { compaction: { phase: "summary" } } }).compacting,
    true,
  );
});
