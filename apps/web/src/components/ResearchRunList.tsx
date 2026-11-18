import { useResearchRuns } from "../hooks/useResearchRuns";
import type { ResearchRunSummary } from "../api/research-runs";
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
  const { runs, error, reload } = useResearchRuns(selectedId);
  const term = query.trim().toLowerCase();
  const visible = runs.filter(
    (run) =>
      (status === "all" || run.status === status) &&
      `${run.title} ${run.project.name} ${run.id} ${run.summary}`
        .toLowerCase()
        .includes(term),
  );
  const projects = new Map<
    string,
    { name: string; runs: ResearchRunSummary[] }
  >();
  for (const run of visible) {
    const project = projects.get(run.project.id) ?? {
      name: run.project.name,
      runs: [],
    };
    project.runs.push(run);
    projects.set(run.project.id, project);
  }
  if (!visible.length && !error) return empty ?? null;
  return (
    <section aria-label="Research run history">
      <h3>Research runs</h3>
      {error && (
        <p className="fq-jobs-no-match" role="alert">
          {error}{" "}
          <button className="link" onClick={reload}>
            Retry
          </button>
        </p>
      )}
      {[...projects].map(([id, project]) => (
        <section key={id} aria-label={project.name}>
          <h4 className="fq-research-project-heading">{project.name}</h4>
          {project.runs.map((run) => {
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
                    <i
                      className={"fq-job-dot " + run.status}
                      aria-hidden="true"
                    />
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
      ))}
    </section>
  );
}
