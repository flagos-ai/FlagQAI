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
  onCompare,
}: {
  actions: PlatformAction[];
  active: boolean;
  follow: boolean;
  requested: boolean;
  onCompare: (left: string, right: string) => Promise<void>;
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
    [error, setError] = useState("");
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
      setError(
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
  const failures = list.filter((run) =>
    ["failed", "cancelled", "timed_out"].includes(run.status),
  );
  const collectionIssues = list.some(
    (run) =>
      ["partial", "failed"].includes(run.collection_status || "") ||
      !!run.collection_errors?.length,
  );
  const working = list.some((run) =>
    ["queued", "running"].includes(run.status),
  );
  const collecting = list.some(
    (run) =>
      ["queued", "running", "completed"].includes(run.status) &&
      ["pending", "collecting"].includes(run.collection_status || ""),
  );
  const incomplete = list.length !== ids.length;
  const settled =
    !active &&
    !working &&
    !collecting &&
    !incomplete &&
    !error &&
    !collectionIssues;
  const compare = async () => {
    if (outputs.length < 2 || opening) return;
    setOpening(true);
    try {
      await onCompare(outputs[0], outputs[1]);
    } catch (problem) {
      setError(String(problem));
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
      outputs.length !== 2 ||
      failures.length
    )
      return;
    autoOpened.current = true;
    void compare();
  }, [settled, follow, requested, outputs.join(","), failures.length]);
  if (
    !actions.some(
      (action) =>
        action.operation === "model.create" || action.result?.python_run,
    )
  )
    return null;
  const phase =
    failures.length || collectionIssues
      ? "Run needs attention"
      : working
        ? "Running experiment"
        : collecting
          ? "Collecting saved results"
          : incomplete
            ? "Checking run progress"
            : active
              ? "Agent working"
              : outputs.length
                ? "Experiment ready"
                : "No saved result yet";
  return (
    <section className="fq-experiment-task" aria-label="Experiment progress">
      <div>
        <UIIcon
          name={
            working || active ? "clock" : failures.length ? "info" : "check"
          }
        />
        <strong>{phase}</strong>
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
            list.length &&
            list.length === ids.length &&
            list.every((run) => run.status === "completed")
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
            outputs.length && !collecting ? "done" : collecting ? "current" : ""
          }
        >
          Results
        </li>
      </ol>
      {error && <p role="status">{error}</p>}
      {(failures.length > 0 || collectionIssues) && (
        <p>
          Open run details for execution or collection errors. Earlier results
          are retained.
        </p>
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
