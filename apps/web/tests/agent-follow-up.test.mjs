import test from "node:test";
import assert from "node:assert/strict";
import { agentFollowUp } from "../src/state/agent-follow-up.ts";
import { emptyAgentView } from "../src/state/agent-view.ts";
function completed(question = "解释这个电路", answer = "电路包含两个量子门。") {
  return {
    ...emptyAgentView(),
    projected: true,
    order: [1, 2],
    rows: {
      1: { id: 1, seq: 1, kind: "user", text: question },
      2: { id: 2, kind: "assistant", text: answer },
    },
  };
}
test("follow-ups depend on the latest exchange and follow the user's language", () => {
  assert.match(agentFollowUp(completed()).prompt, /资源/);
  assert.match(
    agentFollowUp(completed("Compare QAOA results", "Results improved")).prompt,
    /parameters/,
  );
  assert.match(
    agentFollowUp(completed("为什么报错", "Import failed")).prompt,
    /修复/,
  );
  assert.match(
    agentFollowUp(completed("Explain this notebook", "Here is the code"))
      .prompt,
    /runnable example/,
  );
  const view = completed();
  view.order.push(3);
  view.rows[3] = { id: 3, kind: "user", text: "New question" };
  assert.equal(agentFollowUp(view), null);
});
test("unfinished, stopped and pending-decision turns have no follow-up", () => {
  for (const patch of [
    { working: true },
    { projected: false },
    { stop: "stopped" },
    { permissions: { request: {} } },
    { questions: { request: {} } },
    { context: { compaction: {} } },
    { turnTimings: { 1: { outcome: "failed" } } },
  ]) {
    assert.equal(agentFollowUp({ ...completed(), ...patch }), null);
  }
  assert.equal(agentFollowUp(emptyAgentView()), null);
});
test("follow-ups do not repeat the last question", () => {
  const first = agentFollowUp(completed()).prompt;
  assert.notEqual(agentFollowUp(completed(first)).prompt, first);
});
