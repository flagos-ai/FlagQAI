import { useEffect, useRef, useState } from "react";
import type { PythonWorkspace } from "../hooks/usePythonWorkspace";
import type { WorkspaceAction } from "../contracts/quantum-workspace";
import type { PythonRun } from "../api/python-runs";
import { pythonFailure } from "../state/python-failure";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { CodeExample } from "./CodeExample";
export function PythonConsole({
  python,
  source,
  dispatch,
  onLocate,
  onRepair,
}: {
  python: PythonWorkspace;
  source: string;
  dispatch: React.Dispatch<WorkspaceAction>;
  onLocate: (line: number) => void;
  onRepair: (run: PythonRun) => Promise<void>;
}) {
  const { run, error } = python;
  const logs = useRef<HTMLPreElement>(null);
  const [follow, setFollow] = useState(true);
  const [repairing, setRepairing] = useState(false),
    [repairError, setRepairError] = useState("");
  const [failedSource, setFailedSource] = useState<PythonRun | null>(null);
  useEffect(() => {
    if (follow && logs.current)
      logs.current.scrollTop = logs.current.scrollHeight;
  }, [run?.logs, follow]);
  const failure = run ? pythonFailure(run) : null;
  const line = failure?.line;
  return (
    <section className="fq-python-console" aria-label="Python output">
      {failedSource && (
        <Modal
          className="fq-attachment-preview"
          label="Failed Python source"
          onClose={() => setFailedSource(null)}
        >
          <header>
            <h2>Failed Python source</h2>
            <CloseButton
              label="Close failed source"
              onClick={() => setFailedSource(null)}
            />
          </header>
          <p>
            Run {failedSource.id} · {failedSource.source_hash} · Your current
            editor is unchanged.
          </p>
          <CodeExample
            title="Executed Python snapshot"
            code={failedSource.source}
            language="python"
          />
        </Modal>
      )}
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
      {failure && run && (
        <section
          className="fq-python-collection-errors"
          aria-label="Python failure"
        >
          <b>{failure.summary}</b>
          <p>
            Failed run {run.id.slice(0, 8)}
            {failure.line ? ` · line ${failure.line}` : ""}.{" "}
            {run.source !== source
              ? "The editor has changed. Repair uses the failed snapshot and preserves your draft."
              : "Prepare a repair request with this execution's source and logs."}
          </p>
          <button onClick={() => setFailedSource(run)}>
            View failed source
          </button>{" "}
          <button
            disabled={repairing}
            onClick={async () => {
              setRepairing(true);
              setRepairError("");
              try {
                await onRepair(run);
              } catch (problem) {
                setRepairError(
                  problem instanceof Error
                    ? problem.message
                    : "Cannot prepare repair request.",
                );
              } finally {
                setRepairing(false);
              }
            }}
          >
            {repairing ? "Preparing…" : "Ask Agent to fix"}
          </button>
          {repairError && <p role="alert">{repairError}</p>}
        </section>
      )}
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
