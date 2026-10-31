import { useEffect, useState } from "react";
import { pythonAPI } from "../api/python-runs";
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
  if (!actions.length) return null;
  return (
    <div className="fq-workspace-artifacts" aria-label="Workbench actions">
      <details className="fq-experiment-activity">
        <summary>Experiment activity · {actions.length} actions</summary>
        {actions.slice(-8).map((action) => {
          if (action.result?.python_run)
            return (
              <PythonAction key={action.id} action={action} onOpen={onOpen} />
            );
          const result = action.result,
            program = result?.program;
          const job =
            result?.job && jobs.find((item) => item.id === result.job!.id);
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
                    : "Workbench navigation";
          return (
            <div
              key={action.id}
              className={"fq-workspace-artifact " + action.status}
            >
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
              {action.error && (
                <p className="fq-progress-error">{action.error}</p>
              )}
              {action.status === "completed" &&
                (result?.python_run ||
                  program ||
                  result?.job ||
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
                            : "Open view ↗"}
                  </button>
                )}
            </div>
          );
        })}
      </details>
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
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await pythonAPI.read(run.id, controller.signal);
        if (controller.signal.aborted) return;
        setRun(value);
        if (["queued", "running"].includes(value.status))
          timer = setTimeout(poll, 700);
      } catch {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [run.id]);
  return (
    <div className={"fq-workspace-artifact " + run.status}>
      <div>
        <span className={"fq-progress-dot " + run.status} />
        <strong>Python execution</strong>
        <small>{run.status}</small>
      </div>
      <p>
        {run.name} · {run.environment.transport}
        {run.elapsed_seconds !== undefined ? ` · ${run.elapsed_seconds}s` : ""}
      </p>
      {run.error && <p className="fq-progress-error">{run.error}</p>}
      <button onClick={() => onOpen(action)}>View Python output ↗</button>
      {run.artifact && (
        <button
          onClick={() =>
            onOpen({ ...action, result: { program: run.artifact!.program } })
          }
        >
          Open circuit ↗
        </button>
      )}
      {run.artifact?.job && (
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
