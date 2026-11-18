import { useEffect, useRef, useState } from "react";
import {
  researchRunsAPI,
  type CoordinationProject,
} from "../api/research-runs";
import { coordinationContinuation } from "../state/research-coordination";

type Draft = { text: string; revision: number; request_id: string };
export function ResearchConstraintReview({
  project,
  runId,
  onUpdated,
}: {
  project: CoordinationProject;
  runId: string;
  onUpdated: () => void;
}) {
  const storageKey =
    "fq-research-constraints:" +
    project.coordinator_session_id +
    ":" +
    project.project_id;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(storageKey) ||
          localStorage.getItem(storageKey) ||
          "null",
      );
      if (
        stored &&
        typeof stored.text === "string" &&
        typeof stored.request_id === "string" &&
        Number.isSafeInteger(stored.revision)
      )
        return stored;
    } catch {
      /* Keep an in-memory draft if storage is unavailable. */
    }
    return {
      text: project.constraints,
      revision: project.constraint_revision,
      request_id: crypto.randomUUID(),
    };
  });
  const [review, setReview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [unconfirmed, setUnconfirmed] = useState<Record<
    string,
    unknown
  > | null>(null);
  const lock = useRef(false),
    pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const store = (value: Draft) => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Preserve memory. */
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Preserve memory. */
    }
    return value;
  };
  useEffect(() => {
    if (
      !unconfirmed ||
      !project.history?.some(
        (event) =>
          event.request_id === unconfirmed.request_id &&
          event.action === unconfirmed.action,
      )
    )
      return;
    setError("");
    setUnconfirmed(null);
    setNotice(
      unconfirmed.action === "confirm_plan"
        ? "New task versions confirmed. Nothing has been executed; copy the continuation request when ready."
        : unconfirmed.action === "reject_plan"
          ? "Adjustment rejected. Earlier tasks and evidence are retained."
          : "Constraint update recorded. Review the current adjustment plan.",
    );
    if (
      unconfirmed.action === "constraints" &&
      project.constraints === unconfirmed.constraints &&
      project.constraint_revision ===
        Number(unconfirmed.expected_constraint_revision) + 1
    ) {
      setDraft((current) =>
        current.request_id !== unconfirmed.request_id
          ? current
          : store({
              text: project.constraints,
              revision: project.constraint_revision,
              request_id: crypto.randomUUID(),
            }),
      );
    }
  }, [project, unconfirmed]);
  const act = async (data: Record<string, unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setUnconfirmed(null);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const result = await researchRunsAPI.coordinate(
        runId,
        {
          project_id: project.project_id,
          coordinator_session_id: project.coordinator_session_id,
          ...data,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const plan = Object.values(result.coordination.adjustment_plans).find(
        (plan) => plan.status === "proposed" && plan.constraints_current,
      );
      if (plan) setReview(plan.id);
      if (data.action === "confirm_plan")
        setNotice(
          "New task versions confirmed. Nothing has been executed; copy the continuation request when ready.",
        );
      if (data.action === "reject_plan")
        setNotice(
          "Adjustment rejected. Earlier tasks and evidence are retained.",
        );
      if (data.action === "constraints")
        setDraft((current) =>
          current.request_id !== data.request_id
            ? current
            : store({
                text: result.coordination.constraints,
                revision: result.coordination.constraint_revision,
                request_id: crypto.randomUUID(),
              }),
        );
      onUpdated();
    } catch (problem) {
      if (!controller.signal.aborted) {
        setUnconfirmed(data);
        setError(problem instanceof Error ? problem.message : String(problem));
        onUpdated();
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      lock.current = false;
    }
  };
  return (
    <section
      className="fq-research-constraint-review"
      aria-label="Research coordination"
    >
      <strong>Project constraints · v{project.constraint_revision}</strong>
      <p>{project.constraints}</p>
      <details>
        <summary>Update constraints</summary>
        <small>
          Coordinator{" "}
          <code title={project.coordinator_session_id}>
            {project.coordinator_session_id.slice(0, 12)}
          </code>
        </small>
        <label>
          Project constraints
          <textarea
            aria-label="Project constraints"
            rows={3}
            maxLength={4000}
            value={draft.text}
            onChange={(event) =>
              setDraft(
                store({
                  ...draft,
                  text: event.target.value,
                  request_id: crypto.randomUUID(),
                }),
              )
            }
          />
        </label>
        {draft.revision !== project.constraint_revision && (
          <p role="status">
            Saved constraints changed. Your draft is retained.{" "}
            <button
              className="link"
              onClick={() =>
                setDraft(
                  store({
                    ...draft,
                    revision: project.constraint_revision,
                    request_id: crypto.randomUUID(),
                  }),
                )
              }
            >
              Review against v{project.constraint_revision}
            </button>
          </p>
        )}
        <button
          disabled={
            busy ||
            draft.revision !== project.constraint_revision ||
            !draft.text.trim() ||
            draft.text === project.constraints
          }
          onClick={() =>
            void act({
              action: "constraints",
              constraints: draft.text,
              expected_constraint_revision: draft.revision,
              request_id: draft.request_id,
            })
          }
        >
          Review adjustment
        </button>
      </details>
      {Object.values(project.adjustment_plans).map((plan) => (
        <section key={plan.id} aria-label="Task adjustment plan">
          <strong>
            Adjustment for constraints v{plan.constraint_revision} ·{" "}
            {plan.status}
          </strong>{" "}
          <button
            className="link"
            onClick={() =>
              setReview((value) => (value === plan.id ? null : plan.id))
            }
          >
            {review === plan.id
              ? "Hide changes"
              : plan.status === "proposed"
                ? "Review changes"
                : "View changes"}
          </button>
          {review === plan.id && (
            <>
              <p>
                {plan.suggested_by === "constraint-recheck-template"
                  ? "Template recheck: reassess these tasks under the revised constraints. Earlier evidence is historical."
                  : "Coordinator-proposed adjustments. Earlier tasks and evidence are retained."}{" "}
              </p>
              {plan.changes.map((change) => (
                <section key={change.task_id}>
                  <strong>
                    {change.task} · v{change.task_version - 1} → v
                    {change.task_version}
                  </strong>
                  <p>Previous: {change.previous_constraints}</p>
                  <p>Revised: {plan.constraints}</p>
                  {plan.suggested_by !== "constraint-recheck-template" && (
                    <p>{change.reason}</p>
                  )}
                  <small>
                    Starting code{" "}
                    <code title={change.source.source_sha256}>
                      {change.source.source_sha256.slice(0, 12)}
                    </code>{" "}
                    · {change.previous_evidence.length} earlier reports retained
                    separately
                  </small>
                </section>
              ))}
              {plan.status === "proposed" && plan.constraints_current && (
                <div className="fq-research-review-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "confirm_plan",
                        plan_id: plan.id,
                        plan_sha256: plan.sha256,
                        expected_constraint_revision: plan.constraint_revision,
                        request_id: "confirm-" + plan.id,
                      })
                    }
                  >
                    Confirm new task versions
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "reject_plan",
                        plan_id: plan.id,
                        plan_sha256: plan.sha256,
                        expected_constraint_revision: plan.constraint_revision,
                        request_id: "reject-" + plan.id,
                      })
                    }
                  >
                    Reject adjustment
                  </button>
                </div>
              )}
            </>
          )}
          {plan.status === "confirmed" && plan.constraints_current && (
            <button
              className="link"
              disabled={busy}
              onClick={() => {
                void Promise.resolve()
                  .then(() =>
                    navigator.clipboard.writeText(
                      coordinationContinuation(project, plan),
                    ),
                  )
                  .then(() =>
                    setNotice(
                      "Continuation request copied. Send it to the named coordinator when ready; your chat draft is unchanged.",
                    ),
                  )
                  .catch((problem) => setError(String(problem)));
              }}
            >
              Copy continuation request
            </button>
          )}
        </section>
      ))}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="link" onClick={onUpdated}>
            Reload coordination
          </button>
        </p>
      )}
    </section>
  );
}
