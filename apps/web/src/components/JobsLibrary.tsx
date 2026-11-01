import { useState } from "react";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import { jobActive, jobGroups, jobStatus } from "../state/job-presentation";
import { UIIcon } from "./UIIcon";

export function JobsLibrary({
  state,
  dispatch,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.filter((id) =>
    state.jobs.some((job) => job.id === id && job.experiment?.has_result),
  );
  const groups = jobGroups(state.jobs, query, status);
  return (
    <>
      <div className="fq-pane-title">
        JOBS <span className="fq-jobs-total">{state.jobs.length}</span>
      </div>
      <div className="fq-jobs-search">
        <label>
          <UIIcon name="search" size={14} />
          <input
            aria-label="Search jobs"
            placeholder="Search jobs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter jobs by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="queued">Queued</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <div className="fq-jobs-list" aria-label="Job history">
        {groups.map(([label, jobs]) => (
          <section key={label}>
            <h3>{label}</h3>
            {jobs.map((job) => (
              <div
                key={job.id}
                className={
                  "fq-job-row " +
                  ((state.selectedJobId || state.jobs[0]?.id) === job.id
                    ? "selected"
                    : "")
                }
              >
                <input
                  type="checkbox"
                  aria-label={`Compare ${job.name}`}
                  checked={selected.includes(job.id)}
                  disabled={
                    !job.experiment?.has_result ||
                    (selected.length === 2 && !selected.includes(job.id))
                  }
                  onChange={(e) =>
                    setSelection(
                      e.target.checked
                        ? [...selected, job.id]
                        : selected.filter((id) => id !== job.id),
                    )
                  }
                />
                <button
                  aria-label={`Open job ${job.name}`}
                  aria-current={
                    (state.selectedJobId || state.jobs[0]?.id) === job.id
                      ? "true"
                      : undefined
                  }
                  onClick={() => {
                    if (state.comparison)
                      dispatch({ type: "compare-experiments" });
                    dispatch({ type: "job", id: job.id });
                  }}
                >
                  <strong title={job.name}>{job.name}</strong>
                  <span>
                    <i className={"fq-job-dot " + job.status} />
                    {jobStatus(job)}
                    {job.experiment && (
                      <time
                        title={new Date(
                          job.experiment.imported_at,
                        ).toLocaleString()}
                      >
                        {new Date(
                          job.experiment.imported_at,
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    )}
                  </span>
                  <small>
                    {selected.includes(job.id) &&
                      (selected.indexOf(job.id) === 0
                        ? "Baseline · "
                        : "Variant · ")}
                    {jobActive(job)
                      ? "Results appear when execution finishes"
                      : job.status === "failed"
                        ? "Open to inspect the error"
                        : job.result
                          ? `${job.result.qubits} qubits${job.experiment ? " · .fqx" : ` · ${job.result.shots.toLocaleString()} shots`}`
                          : "No measurement result"}
                  </small>
                </button>
              </div>
            ))}
          </section>
        ))}
        {!groups.length && (
          <p className="fq-jobs-no-match">
            {state.jobs.length
              ? "No matching jobs. Try another search or status."
              : "Your runs and saved results will appear here."}
          </p>
        )}
      </div>
      <div className="fq-jobs-compare-action">
        <button
          disabled={selected.length !== 2}
          onClick={() =>
            dispatch({
              type: "compare-experiments",
              left: selected[0],
              right: selected[1],
            })
          }
        >
          Compare{" "}
          {selected.length ? `${selected.length} / 2` : "two experiments"}
        </button>
        {selected.length > 0 ? (
          <button className="link" onClick={() => setSelection([])}>
            Clear selection
          </button>
        ) : (
          <small>Select two saved results using the checkboxes.</small>
        )}
      </div>
    </>
  );
}
