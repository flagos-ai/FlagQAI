import { useEffect, useRef, useState } from "react";
import type { PythonWorkspace } from "../hooks/usePythonWorkspace";
import type { WorkspaceAction } from "../contracts/quantum-workspace";
export function PythonConsole({
  python,
  source,
  dispatch,
  onLocate,
}: {
  python: PythonWorkspace;
  source: string;
  dispatch: React.Dispatch<WorkspaceAction>;
  onLocate: (line: number) => void;
}) {
  const { run, error } = python;
  const logs = useRef<HTMLPreElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (follow && logs.current)
      logs.current.scrollTop = logs.current.scrollHeight;
  }, [run?.logs, follow]);
  const traceback =
    run?.logs
      .filter((log) => log.stream === "stderr")
      .map((log) => log.text)
      .join("") || "";
  const lines = [
    ...traceback.matchAll(/File "(?:[^"\n]*\/)?main\.py", line (\d+)/g),
  ];
  const line = Number(lines.at(-1)?.[1]);
  return (
    <section className="fq-python-console" aria-label="Python output">
      <div className="fq-pane-title">
        PYTHON OUTPUT <span>{run?.status || "Ready"}</span>
        <select
          aria-label="Python run history"
          value={run?.id || ""}
          onChange={(event) =>
            dispatch({ type: "python-run", id: event.target.value })
          }
        >
          <option value="" disabled>
            Recent runs
          </option>
          {python.runs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.status}
            </option>
          ))}
        </select>
      </div>
      <div className="fq-python-result-toolbar">
        <small>
          {run?.runtime
            ? `Python ${run.runtime.python} · ${run.environment.transport}`
            : `${python.environment?.transport || "Configured environment"} · Single-file task`}
          {run?.elapsed_seconds !== undefined
            ? ` · ${run.elapsed_seconds}s · exit ${run.exit_code ?? "—"}`
            : ""}
        </small>
        {run?.runtime?.sdk_version && (
          <small>
            FlagQuantum {run.runtime.sdk_version} ·{" "}
            {run.runtime.save_load_supported
              ? "save/load ready"
              : "SDK upgrade needed for .fqx"}
          </small>
        )}
        {run?.collection_status === "collecting" && (
          <small role="status">Collecting saved experiments…</small>
        )}
        {run && run.source !== source && (
          <small>
            Results are from an earlier code snapshot. Run Python to update.
          </small>
        )}
        {["running", "queued"].includes(run?.status || "") && (
          <button onClick={() => void python.cancel()}>Stop</button>
        )}
        {run?.artifact && (
          <button onClick={python.openCircuit}>Open circuit ↗</button>
        )}
        {run?.artifact?.job && (
          <button onClick={python.openResults}>View results ↗</button>
        )}
        {!!line && run?.source === source && (
          <button onClick={() => onLocate(line)}>Go to line {line} ↗</button>
        )}
      </div>
      {!!run?.experiments?.length && (
        <section
          className="fq-python-experiments"
          aria-label="Saved Python experiments"
          title="Linked to this run's source snapshot. Opening an experiment preserves your editor draft."
        >
          <small className="eyebrow">
            SAVED EXPERIMENTS · {run.experiments.length}
          </small>
          {run.experiments.map((reference) => (
            <div
              className="fq-python-experiment"
              role="group"
              aria-label={reference.filename}
              key={reference.id}
            >
              <span title={reference.filename}>{reference.filename}</span>
              <button
                onClick={() =>
                  void python.openExperiment(reference.id, "program")
                }
              >
                View circuit ↗
              </button>
              {reference.has_result ? (
                <button
                  onClick={() =>
                    void python.openExperiment(reference.id, "jobs")
                  }
                >
                  View result ↗
                </button>
              ) : (
                <small>Circuit only · no saved result</small>
              )}
            </div>
          ))}
        </section>
      )}
      {!!run?.collection_errors?.length && (
        <section className="fq-python-collection-errors" role="alert">
          <b>
            Experiment collection{" "}
            {run.collection_status === "collecting"
              ? "reported issues"
              : run.collection_status === "partial"
                ? "partially completed"
                : "failed"}
          </b>
          <p>
            Python execution: {run.execution_status || run.status}. Collection
            errors are separate from the script exit status.
          </p>
          {run.collection_errors.map((item, index) => (
            <p key={index}>
              {item.filename || "File scan"}: {item.message}
              {item.file_id && (
                <a
                  className="link"
                  href={`/api/python/runs/${encodeURIComponent(run.id)}/files/${encodeURIComponent(item.file_id)}`}
                  download={item.filename}
                >
                  {" "}
                  Download saved file ↓
                </a>
              )}
            </p>
          ))}
        </section>
      )}
      {error && (
        <p className="fq-python-request-error" role="alert">
          {error}
        </p>
      )}
      <pre
        ref={logs}
        className="fq-python-logs"
        aria-live="polite"
        onScroll={() => {
          const element = logs.current;
          if (element)
            setFollow(
              element.scrollHeight - element.scrollTop - element.clientHeight <
                32,
            );
        }}
      >
        {run?.logs.length ? (
          run.logs.map((log, index) => (
            <span
              key={index}
              className={log.stream === "stderr" ? "stderr" : ""}
            >
              {log.text}
            </span>
          ))
        ) : (
          <span className="muted">
            {run?.status === "running"
              ? "Waiting for output…"
              : "Run Python to see stdout, errors and published artifacts here."}
          </span>
        )}
        {run?.truncated && <span>\nOutput truncated at 64 KiB.</span>}
        {run?.error && <span className="stderr">{"\n" + run.error}</span>}
      </pre>
      {run?.status === "completed" &&
        run.collection_status === "completed" &&
        !run.experiments?.length &&
        !run.artifact && (
          <p>
            No .fqx files were saved by this run. Use fq.save("bell.fqx",
            result.plan, result=result) to display a circuit and results here.
          </p>
        )}
      {run?.artifact?.statevector && (
        <details>
          <summary>
            Statevector · {run.artifact.statevector.length} amplitudes
          </summary>
          <pre>
            {run.artifact.statevector
              .map(
                ([real, imag], index) =>
                  `|${index.toString(2).padStart(run.artifact!.program.compiled.qubits, "0")}>  ${real.toFixed(6)} ${imag < 0 ? "-" : "+"} ${Math.abs(imag).toFixed(6)}i`,
              )
              .join("\n")}
          </pre>
        </details>
      )}
    </section>
  );
}
