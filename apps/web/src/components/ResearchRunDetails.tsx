import { useEffect, useState } from "react";
import { researchRunsAPI, type ResearchRun } from "../api/research-runs";
import { ResearchBaseline } from "./ResearchBaseline";

function metric(value: string | number | null, digits: number | null) {
  if (value == null) return "Unavailable";
  return typeof value === "number" && digits !== null
    ? value.toLocaleString("en-US", { maximumFractionDigits: digits })
    : String(value);
}

export function ResearchRunDetails({
  id,
  onBack,
  onOpen,
}: {
  id: string;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [run, setRun] = useState<ResearchRun>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [showEvidence, setShowEvidence] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void researchRunsAPI
      .read(id, controller.signal)
      .then(({ run }) => {
        if (!controller.signal.aborted) {
          setRun(run);
          setError("");
        }
      })
      .catch((problem) => {
        if (!controller.signal.aborted)
          setError(
            problem instanceof Error
              ? problem.message
              : "Cannot read this research run.",
          );
      });
    return () => controller.abort();
  }, [id, revision]);
  const ratio = run?.comparison.cost_ratio;
  const change =
    ratio && Number.isFinite(ratio) && ratio > 0 ? (1 - 1 / ratio) * 100 : null;
  return (
    <section
      className="fq-content-pad fq-research-run"
      aria-label="Research run"
    >
      <button className="link" onClick={onBack}>
        Back to jobs
      </button>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            className="link"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      ) : (
        !run && <p role="status">Loading research run…</p>
      )}
      {run && (
        <>
          <header>
            <small>{run.project.name}</small>
            <h2>{run.title}</h2>
            <span className="fq-research-status">{run.status}</span>
            {" · "}
            <time dateTime={run.created_at}>
              {new Date(run.created_at).toLocaleString()}
            </time>
          </header>
          <p>{run.summary}</p>
          {run.error && <p role="alert">{run.error}</p>}
          {change !== null && (
            <p>
              Resource cost{" "}
              <strong>
                {change === 0
                  ? "unchanged"
                  : `${Math.abs(change).toFixed(4)}% ${change > 0 ? "lower" : "higher"}`}
              </strong>{" "}
              than baseline
            </p>
          )}
          {!!run.comparison.columns.length && (
            <div className="fq-research-run-table">
              <table aria-label="Recorded verification metrics">
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    {run.comparison.columns.map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {run.comparison.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {row.values.map((value, index) => (
                        <td key={index}>{metric(value, row.digits)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {run.scope && <p className="fq-muted">{run.scope}</p>}
          {!!run.exports.length && (
            <nav
              className="fq-research-run-downloads"
              aria-label="Run artifacts"
            >
              {run.exports.map((item) => (
                <a
                  key={item.name}
                  href={researchRunsAPI.file(id, item.name)}
                  download={item.name}
                  title={"SHA-256 " + item.sha256}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          {run.project.baseline && (
            <ResearchBaseline
              run={run}
              baseline={run.project.baseline}
              onOpen={onOpen}
              onReload={() => {
                setRun(undefined);
                setError("");
                setRevision((value) => value + 1);
              }}
              onChange={(baseline) =>
                setRun(
                  (current) =>
                    current && {
                      ...current,
                      project: { ...current.project, baseline },
                      is_project_baseline:
                        baseline.current?.run_id === current.id &&
                        baseline.current.source_sha256 ===
                          current.source_sha256,
                    },
                )
              }
            />
          )}
          <details
            onToggle={(event) => setShowEvidence(event.currentTarget.open)}
          >
            <summary>Archived evidence</summary>
            {run.source_sha256 && (
              <p>
                Source SHA-256 <code>{run.source_sha256}</code>
              </p>
            )}
            {showEvidence && <pre>{JSON.stringify(run.evidence, null, 2)}</pre>}
          </details>
        </>
      )}
    </section>
  );
}
