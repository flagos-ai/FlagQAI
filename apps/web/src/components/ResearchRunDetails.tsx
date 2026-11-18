import { useEffect, useState } from "react";
import {
  RESEARCH_RUNS_CHANGED,
  hasActiveResearchTasks,
  researchRunsAPI,
  type ResearchRun,
} from "../api/research-runs";
import { ResearchTeam } from "./ResearchTeam";
import { ResearchBaseline } from "./ResearchBaseline";
import { ResearchCandidateDecision } from "./ResearchCandidateDecision";
import {
  ResearchCandidateDiff,
  ResearchCandidateRevision,
} from "./ResearchCandidateRevision";

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
  const [teamOpenId, setTeamOpenId] = useState<string>();
  const followTeam = !!run && teamOpenId === run.id;
  const running = run?.status === "running";
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let follow = running || followTeam;
    let runWasRunning = running;
    const load = async () => {
      try {
        const { run } = await researchRunsAPI.read(id, controller.signal);
        if (!controller.signal.aborted) {
          if (runWasRunning && run.status !== "running")
            window.dispatchEvent(new Event(RESEARCH_RUNS_CHANGED));
          runWasRunning = run.status === "running";
          follow =
            runWasRunning ||
            (followTeam && hasActiveResearchTasks(run.coordination));
          setRun(run);
          setError("");
        }
      } catch (problem) {
        if (!controller.signal.aborted)
          setError(
            problem instanceof Error
              ? problem.message
              : "Cannot read this research run.",
          );
      } finally {
        if (follow && !controller.signal.aborted)
          timer = setTimeout(load, 2000);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, revision, running, followTeam]);
  const ratio = run?.comparison.cost_ratio;
  const change =
    ratio && Number.isFinite(ratio) && ratio > 0 ? (1 - 1 / ratio) * 100 : null;
  const baseline = run?.project.baseline;
  const sourceHash = run?.source_sha256;
  const canRevise =
    run?.status === "completed"
      ? run.exports.some((item) => item.name === "candidate.kmx")
      : !!run?.proposal &&
        ["failed", "interrupted", "rejected"].includes(run.status);
  const reload = () => {
    setRun(undefined);
    setError("");
    setRevision((value) => value + 1);
  };
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
            <span className="fq-research-status">
              {run.status === "review" ? "Review required" : run.status}
            </span>
            {" · "}
            <time dateTime={run.created_at}>
              {new Date(run.created_at).toLocaleString()}
            </time>
          </header>
          <p>{run.summary}</p>
          {run.error && <p role="alert">{run.error}</p>}
          {running && <p role="status">Verification running locally…</p>}
          {change !== null && (
            <p>
              Resource cost{" "}
              <strong>
                {change === 0
                  ? "unchanged"
                  : `${Math.abs(change).toFixed(4)}% ${change > 0 ? "lower" : "higher"}`}
              </strong>{" "}
              than this run’s archived baseline
            </p>
          )}
          {run.current_comparison && (
            <p aria-label="Current baseline comparison">
              Resource cost difference from{" "}
              <button
                className="link"
                onClick={() => onOpen(run.current_comparison!.baseline_run_id)}
              >
                current project baseline
              </button>
              {" · "}
              <strong>
                {run.current_comparison.cost_delta > 0 ? "+" : ""}
                {run.current_comparison.cost_delta.toLocaleString("en-US", {
                  maximumFractionDigits: 4,
                })}
              </strong>
              {" · lower is better"}
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
          <ResearchCandidateDiff run={run} onOpen={onOpen} />
          {run.status === "review" && sourceHash && baseline && (
            <ResearchCandidateDecision
              run={run}
              sourceHash={sourceHash}
              projectRevision={baseline.revision}
              onReload={reload}
              onChange={(updated) => {
                setRun(updated);
                window.dispatchEvent(new Event(RESEARCH_RUNS_CHANGED));
              }}
            />
          )}
          {baseline && (
            <ResearchBaseline
              run={run}
              baseline={baseline}
              onOpen={onOpen}
              onReload={reload}
              onChange={reload}
            />
          )}
          {baseline && sourceHash && canRevise && (
            <ResearchCandidateRevision
              key={sourceHash}
              run={run}
              sourceHash={sourceHash}
              projectRevision={baseline.revision}
              onOpen={onOpen}
              onReload={reload}
            />
          )}
          <ResearchTeam
            key={run.id}
            run={run}
            onOpen={onOpen}
            open={followTeam}
            onOpenChange={(open) => setTeamOpenId(open ? run.id : undefined)}
          />
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
