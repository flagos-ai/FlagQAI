import { useEffect, useState } from "react";
import { researchRunsAPI, type ResearchRunSummary } from "../api/research-runs";
import type { WorkspaceAction } from "../contracts/quantum-workspace";

export function ResearchRunList({
  query,
  status,
  selectedId,
  dispatch,
  empty,
}: {
  query: string;
  status: string;
  selectedId?: string;
  dispatch: React.Dispatch<WorkspaceAction>;
  empty?: React.ReactNode;
}) {
  const [runs, setRuns] = useState<ResearchRunSummary[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void researchRunsAPI
      .list(controller.signal)
      .then(({ runs }) => {
        if (!controller.signal.aborted) {
          setRuns(runs);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load saved research runs.");
      });
    return () => controller.abort();
  }, [revision, selectedId]);
  const term = query.trim().toLowerCase();
  const visible = runs.filter(
    (run) =>
      (status === "all" || run.status === status) &&
      `${run.title} ${run.project.name} ${run.id} ${run.summary}`
        .toLowerCase()
        .includes(term),
  );
  if (!visible.length && !error) return empty ?? null;
  return (
    <section aria-label="Research run history">
      <h3>Research runs</h3>
      {error && (
        <p className="fq-jobs-no-match" role="alert">
          {error}{" "}
          <button
            className="link"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {visible.map((run) => {
        const selected = selectedId === run.id;
        const date = new Date(run.created_at);
        return (
          <div
            key={run.id}
            className={"fq-job-row" + (selected ? " selected" : "")}
          >
            <button
              aria-current={selected ? "true" : undefined}
              aria-label={`Open research run ${run.title} · ${run.id.slice(-8)}`}
              title={`${run.project.name} · ${date.toLocaleString()} · ${run.id}`}
              onClick={() => dispatch({ type: "research-run", id: run.id })}
            >
              <strong>{run.title}</strong>
              <span className="fq-job-row-summary">
                <i className={"fq-job-dot " + run.status} aria-hidden="true" />
                <span className="fq-research-status">
                  {run.status === "review" ? "Review required" : run.status}
                </span>
                <time dateTime={run.created_at}>
                  {date.toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </span>
            </button>
          </div>
        );
      })}
    </section>
  );
}
