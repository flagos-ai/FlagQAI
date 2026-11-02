import { useEffect, useState } from "react";
import { pythonAPI } from "../api/python-runs";
import {
  pythonActivityFeedback,
  pythonActivityUpdating,
} from "../state/python-activity";
import {
  workspaceActivityGroups,
  workspacePageLabel,
} from "../state/workspace-activity";
import type { PlatformAction } from "../api/platform";
import type { QuantumJob } from "../contracts/quantum-workspace";
export function AgentWorkspaceActions({
  actions,
  jobs,
  onOpen,
}: {
  actions: PlatformAction[];
  jobs: QuantumJob[];
  onOpen: (action: PlatformAction) => void;
}) {
  const [earlierOpen, setEarlierOpen] = useState(false);
  if (!actions.length) return null;
  const groups = workspaceActivityGroups(actions);
  const card = (action: PlatformAction) => (
    <WorkspaceActionCard
      key={action.id}
      action={action}
      jobs={jobs}
      onOpen={onOpen}
    />
  );
  return (
    <div className="fq-workspace-artifacts" aria-label="Workbench actions">
      <details className="fq-experiment-activity">
        <summary>Experiment activity · {actions.length} actions</summary>
        {!!groups.earlier.length && (
          <details className="fq-activity-earlier" open={earlierOpen}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                setEarlierOpen(!earlierOpen);
              }}
            >
              Earlier activity · {groups.earlier.length}
            </summary>
            {earlierOpen && groups.earlier.map(card)}
          </details>
        )}
        {groups.recent.map(card)}
        {!!groups.navigation.length && (
          <details className="fq-page-changes">
            <summary>Page changes · {groups.navigation.length}</summary>
            <ul>
              {groups.navigation.map((action) => {
                const page = workspacePageLabel(action.result?.page);
                const target =
                  action.result?.program_id || action.result?.job_id;
                return (
                  <li key={action.id}>
                    <button
                      onClick={() => onOpen(action)}
                      aria-label={"Open " + page + " view"}
                    >
                      <span>{page}</span>
                      {target && (
                        <code title={target}>{target.slice(0, 12)}</code>
                      )}
                      <span aria-hidden="true">↗</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </details>
    </div>
  );
}

function WorkspaceActionCard({
  action,
  jobs,
  onOpen,
}: {
  action: PlatformAction;
  jobs: QuantumJob[];
  onOpen: (action: PlatformAction) => void;
}) {
  if (action.result?.python_run)
    return <PythonAction action={action} onOpen={onOpen} />;
  const result = action.result,
    program = result?.program;
  const job = result?.job && jobs.find((item) => item.id === result.job!.id);
  const label = action.operation.startsWith("python.")
    ? "Python execution"
    : action.operation === "compile"
      ? "Circuit compiled"
      : action.operation === "run"
        ? "Execution"
        : action.operation === "model.create"
          ? "Model created"
          : action.operation === "model.share"
            ? "Editor linked"
            : action.operation === "experiment.compare"
              ? "Results compared"
              : action.operation === "focus"
                ? "Page change"
                : "Workbench action";
  return (
    <div className={"fq-workspace-artifact " + action.status}>
      <div>
        <span
          className={
            "fq-progress-dot " +
            (action.status === "running" ? "running" : action.status)
          }
          aria-hidden="true"
        />
        <strong>{label}</strong>
        <small>
          {action.status === "completed"
            ? job?.status || "Completed"
            : action.status === "failed"
              ? "Failed"
              : "Running…"}
        </small>
      </div>
      {result?.python_run && (
        <p>
          {result.python_run.name} · {result.python_run.id.slice(0, 8)}
        </p>
      )}
      {program && (
        <p>
          {program.name} · {program.compiled.qubits} qubits · depth{" "}
          {program.compiled.depth}
        </p>
      )}
      {result?.job && (
        <p>
          {result.job.name} · <code>{result.job.id.slice(0, 8)}</code>
          {job?.result ? ` · ${job.result.shots} shots` : ""}
        </p>
      )}
      {result?.file && (
        <p>
          {result.name} ·{" "}
          {action.operation === "model.share"
            ? "Live editor sync"
            : "Saved separately from your draft"}
        </p>
      )}
      {action.error && <p className="fq-progress-error">{action.error}</p>}
      {action.status === "completed" &&
        (result?.python_run ||
          program ||
          result?.job ||
          result?.comparison ||
          action.operation === "model.create" ||
          result?.page) && (
          <button onClick={() => onOpen(action)}>
            {result?.python_run
              ? "View Python output ↗"
              : program
                ? "Open circuit ↗"
                : result?.job
                  ? "View results ↗"
                  : action.operation === "model.create"
                    ? "Open model ↗"
                    : result?.comparison
                      ? "Open comparison ↗"
                      : "Open view ↗"}
          </button>
        )}
    </div>
  );
}

function PythonAction({
  action,
  onOpen,
}: {
  action: PlatformAction;
  onOpen: (action: PlatformAction) => void;
}) {
  const [run, setRun] = useState(action.result!.python_run!);
  const [interrupted, setInterrupted] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await pythonAPI.read(run.id, controller.signal);
        if (controller.signal.aborted) return;
        if (value.id !== run.id) throw Error("Run identity did not match.");
        setRun(value);
        setInterrupted(false);
        if (pythonActivityUpdating(value)) timer = setTimeout(poll, 700);
      } catch {
        if (!controller.signal.aborted) {
          setInterrupted(true);
          timer = setTimeout(poll, 2000);
        }
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [run.id]);
  const feedback = pythonActivityFeedback(run);
  const visualStatus = interrupted
    ? "pending"
    : feedback.busy
      ? "running"
      : ["failed", "timed_out"].includes(run.status)
        ? "failed"
        : feedback.label === "Results need attention"
          ? "attention"
          : run.status === "cancelled" ||
              feedback.label === "No saved experiment" ||
              feedback.label === "Python finished"
            ? "pending"
            : "completed";
  return (
    <div className={"fq-workspace-artifact " + visualStatus}>
      <div>
        <span
          className={"fq-progress-dot " + visualStatus}
          aria-hidden="true"
        />
        <strong>Python execution</strong>
        <small role="status" aria-label="Python activity status">
          {interrupted ? "Reconnecting…" : feedback.label}
        </small>
      </div>
      <p>
        {run.name} · {run.environment.transport}
        {run.elapsed_seconds !== undefined ? ` · ${run.elapsed_seconds}s` : ""}
      </p>
      <p>
        {interrupted
          ? "Updates interrupted. Reconnecting to the existing run; no new run will be submitted."
          : feedback.message}
      </p>
      {run.error && <p className="fq-progress-error">{run.error}</p>}
      {run.collection_errors?.length ? (
        <details>
          <summary>
            Saved-output details · {run.collection_errors.length}
          </summary>
          {run.collection_errors.map((error, index) => (
            <p key={index}>
              {error.filename}: {error.message}
            </p>
          ))}
        </details>
      ) : null}
      <button
        onClick={() => onOpen({ ...action, result: { python_run: run } })}
      >
        View Python output ↗
      </button>
      {!!run.experiments?.length && (
        <div className="fq-python-activity-experiments">
          {run.experiments.slice(0, 3).map((reference) => (
            <section key={reference.id}>
              <p>{reference.filename}</p>
              <button
                onClick={() =>
                  onOpen({
                    ...action,
                    result: { page: "program", program_id: reference.id },
                  })
                }
              >
                Open circuit ↗
              </button>
              {reference.has_result && (
                <button
                  onClick={() =>
                    onOpen({
                      ...action,
                      result: { page: "jobs", job_id: reference.id },
                    })
                  }
                >
                  View results ↗
                </button>
              )}
            </section>
          ))}
          {run.experiments.length > 3 && (
            <p>
              {run.experiments.length - 3} more saved experiments in Python
              output.
            </p>
          )}
        </div>
      )}
      {!run.experiments?.length && run.artifact && (
        <button
          onClick={() =>
            onOpen({ ...action, result: { program: run.artifact!.program } })
          }
        >
          Open circuit ↗
        </button>
      )}
      {!run.experiments?.length && run.artifact?.job && (
        <button
          onClick={() =>
            onOpen({ ...action, result: { job: run.artifact!.job } })
          }
        >
          View results ↗
        </button>
      )}
    </div>
  );
}
