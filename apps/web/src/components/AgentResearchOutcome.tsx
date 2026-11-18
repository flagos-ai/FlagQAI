import { useEffect, useRef, useState } from "react";
import {
  RESEARCH_RUNS_CHANGED,
  researchRunsAPI,
  type ResearchRun,
} from "../api/research-runs";
import {
  continueResearchPrompt,
  researchDelivery,
} from "../state/research-delivery";

const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: 3 })
    : "Unavailable";

export function AgentResearchOutcome({
  id,
  earlier,
  goal,
  onOpen,
  onPrepare,
}: {
  id: string;
  earlier: string[];
  goal: string;
  onOpen: (id: string) => Promise<void>;
  onPrepare: (prompt: string) => void;
}) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const lock = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    const load = async () => {
      const ticket = ++generation;
      clearTimeout(timer);
      let retry = false;
      try {
        const result = await researchRunsAPI.read(id, controller.signal);
        if (result.run.id !== id)
          throw Error("Research run identity did not match.");
        if (controller.signal.aborted || ticket !== generation) return;
        setRun(result.run);
        setReadError("");
        retry = ["review", "running"].includes(result.run.status);
      } catch (problem) {
        if (!controller.signal.aborted && ticket === generation)
          setReadError(String(problem));
      } finally {
        if (retry && !controller.signal.aborted && ticket === generation)
          timer = setTimeout(load, 2000);
      }
    };
    const refresh = () => {
      void load();
    };
    window.addEventListener(RESEARCH_RUNS_CHANGED, refresh);
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener(RESEARCH_RUNS_CHANGED, refresh);
    };
  }, [id, revision]);
  const act = async (action: () => Promise<void> | void) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (problem) {
      setError(String(problem));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const outcome = run && researchDelivery(run);
  return (
    <section
      className="fq-research-outcome"
      aria-label="Research outcome"
      data-run-id={id}
    >
      <header>
        <strong>
          {readError
            ? "Research result unavailable"
            : outcome?.label || "Reading saved research result…"}
        </strong>
      </header>
      {run && outcome && (
        <>
          {readError && (
            <small>
              Last confirmed record shown below. Reload before preparing an
              iteration.
            </small>
          )}
          <p className="fq-research-outcome-version">
            {run.project.name} · Code{" "}
            <code title={run.source_sha256 || undefined}>
              {run.source_sha256?.slice(0, 12) || "unavailable"}
            </code>
          </p>
          <p className="fq-research-outcome-reason" title={run.summary}>
            {run.summary}
          </p>
          {outcome.passed && (
            <dl>
              <div>
                <dt>Archived baseline → candidate cost</dt>
                <dd>
                  {number(outcome.baselineCost)} → {number(outcome.cost)}
                </dd>
              </div>
              {outcome.delta !== null && (
                <div>
                  <dt>Cost difference · lower is better</dt>
                  <dd>
                    {outcome.delta > 0 ? "+" : ""}
                    {number(outcome.delta)}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <small>
            Saved {new Date(run.created_at).toLocaleString()} ·{" "}
            {run.is_project_baseline
              ? "Current project baseline"
              : "Project baseline revision " +
                (run.project.baseline?.revision ?? "unavailable")}
            {run.proposal?.baseline_parent &&
              " · Compared with " + run.proposal.baseline_parent.slice(0, 20)}
          </small>
          {run.error && (
            <details>
              <summary>Verification error</summary>
              <p>{run.error}</p>
            </details>
          )}
          <div className="fq-research-outcome-actions">
            <button disabled={busy} onClick={() => void act(() => onOpen(id))}>
              {run.status === "review"
                ? "Review saved candidate"
                : outcome.passed
                  ? "View comparison"
                  : "View run"}
            </button>
            {["completed", "failed", "interrupted", "rejected"].includes(
              run.status,
            ) && (
              <button
                disabled={busy || prepared || !!readError || !run.source_sha256}
                onClick={() =>
                  void act(() => {
                    onPrepare(continueResearchPrompt(run, goal));
                    setPrepared(true);
                  })
                }
              >
                Continue iteration
              </button>
            )}
          </div>
          {prepared && (
            <small role="status">
              Iteration request appended to your draft. Send it when ready.
            </small>
          )}
          {!!earlier.length && (
            <details>
              <summary>Earlier research records · {earlier.length}</summary>
              {earlier.map((previous) => (
                <button
                  key={previous}
                  onClick={() => void act(() => onOpen(previous))}
                >
                  {previous.slice(0, 20)}
                </button>
              ))}
            </details>
          )}
        </>
      )}
      {(readError || error) && (
        <p role="alert">
          {readError || error}{" "}
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Reload research result
          </button>
        </p>
      )}
    </section>
  );
}
