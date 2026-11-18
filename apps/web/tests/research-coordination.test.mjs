import test from "node:test";
import assert from "node:assert/strict";
import { coordinationContinuation } from "../src/state/research-coordination.ts";

function fixture() {
  const plan = {
    id: "reviewed-plan",
    sha256: "reviewed-code-and-constraints",
    status: "confirmed",
    constraints_current: true,
    constraint_revision: 2,
    constraints: "At most 48 qubits",
    changes: [{ task_id: "width-v2" }, { task_id: "cost-v2" }],
  };
  const project = {
    project_id: "study",
    coordinator_session_id: "exact-owner",
    constraint_revision: 2,
    tasks: Object.fromEntries(
      plan.changes.map((change) => [
        change.task_id,
        {
          id: change.task_id,
          adjustment_plan_id: plan.id,
          constraints_current: true,
          constraint_revision: 2,
        },
      ]),
    ),
  };
  return { project, plan };
}
test("continuation addresses only reviewed task versions and asks for deduplicated explicit execution", () => {
  const { project, plan } = fixture();
  const before = JSON.stringify({ project, plan });
  const text = coordinationContinuation(project, plan);
  assert.match(text, /exact-owner/);
  assert.match(text, /width-v2, cost-v2/);
  assert.match(text, /do not resubmit/i);
  assert.match(text, /unsaved drafts/);
  assert.match(text, /Earlier reports are historical evidence/);
  assert.equal(JSON.stringify({ project, plan }), before);
});
test("unconfirmed, superseded or changed task versions cannot prepare a continuation", () => {
  const { project, plan } = fixture();
  assert.throws(
    () => coordinationContinuation(project, { ...plan, status: "proposed" }),
    /confirm/,
  );
  assert.throws(
    () =>
      coordinationContinuation(project, {
        ...plan,
        constraints_current: false,
      }),
    /confirm/,
  );
  project.tasks["cost-v2"].adjustment_plan_id = "another-plan";
  assert.throws(
    () => coordinationContinuation(project, plan),
    /versions changed/,
  );
});

test("continuation refuses mixed project and task constraint revisions", () => {
  const { project, plan } = fixture();
  assert.throws(
    () =>
      coordinationContinuation({ ...project, constraint_revision: 3 }, plan),
    /confirm/,
  );
  project.tasks["width-v2"].constraint_revision = 1;
  assert.throws(
    () => coordinationContinuation(project, plan),
    /versions changed/,
  );
});
