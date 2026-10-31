import test from "node:test";
import assert from "node:assert/strict";
import { agentRunStatus, stopFeedback } from "../src/state/agent-run-status.ts";
import { applyAgentRecord, emptyAgentView } from "../src/state/agent-view.ts";
const connected = (patch = {}) => ({
  phase: "connected",
  view: { ...emptyAgentView(), projected: true, ...patch },
});
test("pending native decisions replace Working, while disconnected state takes precedence", () => {
  const agent = connected({ working: true, permissions: { p: {} } });
  assert.equal(agentRunStatus(agent), "Waiting for permission");
  assert.equal(
    agentRunStatus(connected({ working: true, questions: { q: {} } })),
    "Waiting for your answer",
  );
  assert.equal(
    agentRunStatus({ ...agent, phase: "reconnecting" }),
    "Reconnecting…",
  );
  assert.equal(
    agentRunStatus({ ...agent, view: { ...agent.view, projected: false } }),
    "Synchronizing…",
  );
});
test("HTTP stop in flight and native stopping remain pending even if execution looks idle", () => {
  assert.equal(agentRunStatus({ ...connected(), stopping: true }), "Stopping…");
  assert.equal(agentRunStatus(connected({ stop: "stopping" })), "Stopping…");
  assert.equal(
    agentRunStatus({ ...connected({ working: true }), busy: true }),
    "Working",
  );
  assert.equal(agentRunStatus({ ...connected(), sending: true }), "Sending…");
});
test("unknown or failed cancellation cannot claim a stopped turn or hide ongoing work", () => {
  for (const stop of ["unknown", "failed"]) {
    assert.equal(agentRunStatus(connected({ working: true, stop })), "Working");
    assert.match(stopFeedback(stop), /may still be running/);
    assert.doesNotMatch(stopFeedback(stop), /Agent stopped/);
  }
  assert.match(stopFeedback("stopping"), /Waiting for the native Agent/);
  assert.match(stopFeedback("stopped"), /Agent stopped/);
  assert.equal(stopFeedback("none"), "");
});
test("native cancellation queue receipts survive projection and clear with a new control", () => {
  let view = emptyAgentView();
  const apply = (id, event) =>
    (view = applyAgentRecord(view, {
      id,
      session: "s",
      meta: { wake: "sync" },
      event,
    }));
  apply(1, {
    type: "session.control",
    state: "unknown",
    stillQueued: ["a", "b"],
  });
  assert.equal(view.stopQueued, 2);
  assert.match(
    stopFeedback(view.stop, view.stopQueued),
    /2 messages remain queued/,
  );
  apply(2, { type: "session.view", working: true, rows: [], order: [] });
  assert.equal(view.stop, "unknown");
  assert.equal(view.stopQueued, 2);
  apply(3, { type: "session.control", state: "none" });
  assert.equal(view.stopQueued, 0);
  assert.equal(stopFeedback(view.stop, view.stopQueued), "");
});
