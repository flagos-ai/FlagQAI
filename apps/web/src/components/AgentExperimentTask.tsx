import type { ResearchTurn } from "../state/research-record";
import { QaoaIteration } from "./QaoaIteration";
import { QaoaOutcome } from "./QaoaOutcome";
import { experimentTaskStatus } from "../state/experiment-task-status";
import { comparisonCandidates } from "../state/experiment-comparison";
import { useEffect, useRef, useState } from "react";
import { pythonAPI, type PythonRun } from "../api/python-runs";
import type { PlatformAction } from "../api/platform";
import { UIIcon } from "./UIIcon";
export function AgentExperimentTask({
  actions,
  active,
  follow,
  requested,
  outcome,
  onCompare,
  onInspect,
  onCircuit,
  onPrepare,
  researchTurns,
}: {
  actions: PlatformAction[];
  active: boolean;
  follow: boolean;
  requested: boolean;
  outcome?: string;
  onCompare: (left: string, right: string) => Promise<void>;
  onInspect: (run: string) => Promise<void>;
  onCircuit: (id: string) => Promise<void>;
  onPrepare: (prompt: string) => void;
  researchTurns: ResearchTurn[];
}) {
  const ids = [
    ...new Set(
      actions.flatMap((action) =>
        action.result?.python_run ? [action.result.python_run.id] : [],
      ),
    ),
  ].slice(-8);
  const signature = ids.join(",");
  const [runs, setRuns] = useState<Record<string, PythonRun>>({}),
    [runError, setRunError] = useState(""),
    [actionError, setActionError] = useState("");
  const observedLive = useRef(active),
    autoOpened = useRef(false),
    [opening, setOpening] = useState(false);
  if (active) observedLive.current = true;
  useEffect(() => {
    if (!ids.length) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const values = await Promise.allSettled(
        ids.map((id) => pythonAPI.read(id, controller.signal)),
      );
      if (controller.signal.aborted) return;
      const found = values.flatMap((value) =>
        value.status === "fulfilled" ? [value.value] : [],
      );
      setRuns((previous) => ({
        ...previous,
        ...Object.fromEntries(found.map((run) => [run.id, run])),
      }));
      setRunError(
        found.length < ids.length
          ? "Some run progress is unavailable. Last confirmed state is shown."
          : "",
      );
      if (
        active ||
        found.length < ids.length ||
        found.some(
          (run) =>
            ["queued", "running"].includes(run.status) ||
            (run.status === "completed" &&
              ["pending", "collecting"].includes(run.collection_status || "")),
        )
      )
        timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [signature, active]);
  const list = ids.flatMap((id) => (runs[id] ? [runs[id]] : []));
  const outputs = comparisonCandidates(list);
  const task = experimentTaskStatus({
    runs: list,
    expectedRuns: ids.length,
    active,
    outcome,
    unavailable: !!runError,
    savedResults: outputs.length,
  });
  const { working, collecting, incomplete, settled } = task;
  const compare = async () => {
    if (outputs.length < 2 || opening) return;
    setOpening(true);
    setActionError("");
    try {
      const latest = list.at(-1);
      const baseline = latest?.experiments?.find(
        (e) => e.filename === "01-maxcut-baseline.fqx" && e.has_result,
      );
      const optimized = latest?.experiments?.find(
        (e) => e.filename === "02-maxcut-qaoa.fqx" && e.has_result,
      );
      if (baseline && optimized) await onCompare(baseline.id, optimized.id);
      else await onCompare(outputs[0], outputs[1]);
    } catch (problem) {
      setActionError(String(problem));
    } finally {
      setOpening(false);
    }
  };
  useEffect(() => {
    if (
      !observedLive.current ||
      autoOpened.current ||
      !follow ||
      !requested ||
      !settled ||
      outcome !== "completed" ||
      outputs.length !== 2 ||
      task.needsAttention
    )
      return;
    autoOpened.current = true;
    void compare();
  }, [
    settled,
    follow,
    requested,
    outcome,
    outputs.join(","),
    task.needsAttention,
  ]);
  if (
    !actions.some(
      (action) =>
        action.operation === "model.create" || action.result?.python_run,
    )
  )
    return null;
  return (
    <section className="fq-experiment-task" aria-label="Experiment progress">
      <div>
        <UIIcon
          name={
            working || collecting || active
              ? "clock"
              : task.needsAttention || incomplete
                ? "info"
                : "check"
          }
        />
        <strong>{task.label}</strong>
        <small>
          {ids.length} {ids.length === 1 ? "run" : "runs"} · {outputs.length}{" "}
          saved {outputs.length === 1 ? "result" : "results"}
        </small>
      </div>
      <ol aria-label="Experiment stages">
        <li
          className={
            list.length > 0 ||
            actions.some(
              (action) =>
                action.operation === "model.create" &&
                action.status === "completed",
            )
              ? "done"
              : ""
          }
        >
          Code
        </li>
        <li
          className={
            task.recovered ||
            (list.length &&
              list.length === ids.length &&
              list.every((run) => run.status === "completed"))
              ? "done"
              : working
                ? "current"
                : ""
          }
        >
          Run
        </li>
        <li
          className={
            outputs.length && !collecting && !task.needsAttention && !incomplete
              ? "done"
              : collecting
                ? "current"
                : ""
          }
        >
          Results
        </li>
      </ol>
      {(runError || actionError) && (
        <p role="status">{runError || actionError}</p>
      )}
      {task.recovered && (
        <details className="fq-experiment-run-history">
          <summary>Earlier run issues · {task.problems.length}</summary>
          <p>
            Results are ready. Earlier failures remain in Worked for and run
            history.
          </p>
          <ul>
            {task.problems.map((run) => (
              <li key={run.id}>
                <span title={run.id}>
                  {run.name || "Python run"} · {run.id.slice(0, 8)} ·{" "}
                  {run.status === "completed"
                    ? "collection issues"
                    : run.status}
                </span>
                <button
                  aria-label={"Inspect earlier run " + run.id}
                  onClick={async () => {
                    setActionError("");
                    try {
                      await onInspect(run.id);
                    } catch (problem) {
                      setActionError(String(problem));
                    }
                  }}
                >
                  View run
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {task.needsAttention && (
        <p>
          Open run details for execution or collection errors. Earlier results
          are retained.
        </p>
      )}
      {list.at(-1)?.source.includes("# FLAGQAI_QAOA_ITERATION=") && (
        <QaoaIteration
          active={active}
          run={list.at(-1)!}
          onCompare={onCompare}
          onInspect={onInspect}
        />
      )}
      {settled &&
        outcome === "completed" &&
        list
          .at(-1)
          ?.experiments?.some((e) => e.filename === "02-maxcut-qaoa.fqx") && (
          <QaoaOutcome
            run={list.at(-1)!}
            onCompare={onCompare}
            onCircuit={onCircuit}
            onPrepare={onPrepare}
            researchTurns={researchTurns}
            onInspect={onInspect}
          />
        )}
      {outputs.length >= 2 && (
        <button
          className="primary"
          disabled={opening}
          onClick={() => void compare()}
        >
          {opening ? "Opening comparison…" : "Compare results"}
          <UIIcon name="arrow" size={12} />
        </button>
      )}
    </section>
  );
}
