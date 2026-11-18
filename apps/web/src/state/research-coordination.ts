import type { AdjustmentPlan, CoordinationProject } from "../api/research-runs";

/** A continuation is only prepared for the user; it is never sent by a review action. */
export function coordinationContinuation(
  project: CoordinationProject,
  plan: AdjustmentPlan,
): string {
  if (
    plan.status !== "confirmed" ||
    !plan.constraints_current ||
    plan.constraint_revision !== project.constraint_revision
  )
    throw Error("Review and confirm the current adjustment plan first.");
  const tasks = plan.changes.map((change) => project.tasks[change.task_id]);
  if (
    tasks.some(
      (task) =>
        !task ||
        task.adjustment_plan_id !== plan.id ||
        task.constraint_revision !== plan.constraint_revision ||
        !task.constraints_current,
    )
  )
    throw Error(
      "The approved task versions changed. Reload the project first.",
    );
  return [
    `Continue project ${project.project_id} in coordinator session ${project.coordinator_session_id}.`,
    `I confirmed adjustment plan ${plan.id} (${plan.sha256}), constraints v${plan.constraint_revision}: ${plan.constraints}`,
    `Use workbench_research_team to inspect the project and explicitly dispatch only these approved task IDs: ${tasks.map((task) => task.id).join(", ")}.`,
    "Inspect status first; do not resubmit existing activations. Preserve the baseline, previous results, failures and unsaved drafts. Earlier reports are historical evidence, not validation under the revised constraints. Report new code and verification separately.",
  ].join("\n");
}
