import { useEffect, useRef, useState } from "react";
import type { PythonWorkspace } from "../hooks/usePythonWorkspace";
import { ResearchRecord } from "./ResearchRecord";
import type { PlatformBridge } from "../hooks/usePlatformBridge";
import type { ResearchTurn } from "../state/research-record";
import { qaoaFiles } from "../state/qaoa-outcome";
import { UIIcon } from "./UIIcon";
import {
  pythonRunFeedback,
  pythonResultFreshness,
} from "../state/python-feedback";
import type { WorkspaceState } from "../contracts/quantum-workspace";
import type { WorkspaceAction } from "../contracts/quantum-workspace";
import type { PythonRun } from "../api/python-runs";
import { pythonFailure } from "../state/python-failure";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { CodeExample } from "./CodeExample";
import { pythonOutputText } from "../state/python-output";
import { pythonHistoryLabel, pythonRunTime } from "../state/python-history";
export function PythonConsole({
  python,
  source,
  state,
  dispatch,
  onLocate,
  onRepair,
  research,
  compact = false,
  onCompactChange,
}: {
  python: PythonWorkspace;
  source: string;
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  onLocate: (line: number) => void;
  onRepair: (run: PythonRun) => Promise<void>;
  research?: { turns: ResearchTurn[]; bridge: PlatformBridge };
  compact?: boolean;
  onCompactChange?: (compact: boolean) => void;
}) {
  const { error } = python;
  const [researchOpen, setResearchOpen] = useState(false);
  const run =
    !python.submitting && python.run?.id === python.selectedRunId
      ? python.run
      : undefined;
  const researchAction =
    run?.status === "completed" &&
    run.collection_status === "completed" &&
    research &&
    qaoaFiles.every((name) =>
      run.experiments?.some((file) => file.filename === name),
    ) &&
    !research.turns.some((turn) => turn.runs.includes(run.id)) ? (
      <button className="link" onClick={() => setResearchOpen(true)}>
        View research record
      </button>
    ) : null;
  const feedback = pythonRunFeedback({
    selectedId: python.selectedRunId,
    run: python.run,
    submitting: python.submitting,
    stopping: python.stopping,
    error,
    updatesInterrupted: python.updatesInterrupted,
  });
  const logs = useRef<HTMLPreElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [follow, setFollow] = useState(true);
  const [repairingId, setRepairingId] = useState<string | null>(null),
    [repairError, setRepairError] = useState<{
      id: string;
      message: string;
    } | null>(null);
  const repairLock = useRef(false);
  const [failedSource, setFailedSource] = useState<PythonRun | null>(null);
  const [copyResult, setCopyResult] = useState<{
    id: string;
    status: "copied" | "error";
  } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const currentRunId = useRef(run?.id);
  currentRunId.current = run?.id;
  useEffect(() => {
    setCopyResult(null);
    clearTimeout(copyTimer.current);
  }, [run?.id]);
  useEffect(
    () => () => {
      currentRunId.current = undefined;
      clearTimeout(copyTimer.current);
    },
    [],
  );
  const copyStatus =
    copyResult?.id === run?.id ? copyResult?.status : undefined;
  const outputText = pythonOutputText(run);
  const copyOutput = async () => {
    if (!run || !outputText) return;
    const id = run.id;
    clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(outputText);
      if (currentRunId.current !== id) return;
      setCopyResult({ id, status: "copied" });
      copyTimer.current = setTimeout(() => setCopyResult(null), 2500);
    } catch {
      if (currentRunId.current === id) setCopyResult({ id, status: "error" });
    }
  };
  useEffect(() => {
    setFollow(true);
  }, [python.selectedRunId]);
  useEffect(() => {
    if (follow && logs.current)
      logs.current.scrollTop = logs.current.scrollHeight;
  }, [run?.logs, follow]);
  const failure = run ? pythonFailure(run) : null;
  const line = failure?.line;
  const freshness = run ? pythonResultFreshness(run, state) : undefined;
  const working = ["queued", "running"].includes(run?.status || "");
  return (
    <section
      className={"fq-python-console" + (compact ? " is-compact" : "")}
      aria-label="Python output"
    >
      {researchOpen && run && research && (
        <ResearchRecord
          runId={run.id}
          turns={research.turns}
          onClose={() => setResearchOpen(false)}
          onCompare={research.bridge.compare}
          onCircuit={research.bridge.openCircuit}
          onInspect={research.bridge.inspectRun}
        />
      )}
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
            highlightLine={pythonFailure(failedSource)?.line}
          />
        </Modal>
      )}
      <div className="fq-pane-title">
        <span className="fq-console-title">PYTHON OUTPUT</span>
        <span
          className={
            feedback.busy
              ? "fq-run-working fq-console-run-state"
              : "fq-console-run-state"
          }
          role="status"
          aria-label="Python run status"
          title={feedback.label + " · " + feedback.message}
        >
          {feedback.busy && <i aria-hidden="true" />}
          <span>{feedback.label}</span>
        </span>
        <div className="fq-console-actions">
          <button
            className="fq-console-icon"
            aria-label={python.importing ? "Importing…" : "Import .fqx"}
            title={
              python.importing ? "Importing…" : "Import saved .fqx experiment"
            }
            disabled={python.importing || python.recovering}
            onClick={() => upload.current?.click()}
          >
            <UIIcon name="upload" size={14} />
          </button>
          {onCompactChange && (
            <button
              className="fq-console-icon"
              aria-label={
                compact ? "Expand Python output" : "Compact Python output"
              }
              title={
                compact
                  ? "Expand output and logs"
                  : "Show a compact result summary"
              }
              aria-expanded={!compact}
              onClick={() => onCompactChange(!compact)}
            >
              <UIIcon name={compact ? "expand" : "restore"} size={14} />
            </button>
          )}
          <button
            className="fq-console-icon"
            aria-label="Copy Python output"
            title={
              copyStatus === "copied" ? "Output copied" : "Copy current output"
            }
            disabled={!outputText}
            onClick={() => void copyOutput()}
          >
            <UIIcon
              name={copyStatus === "copied" ? "check" : "copy"}
              size={14}
            />
          </button>
          <span role="status" className="fq-sr-only">
            {copyStatus === "copied" ? "Python output copied" : ""}
          </span>
          <button
            className="fq-console-icon fq-console-latest"
            aria-label="Jump to latest Python output"
            title={
              follow ? "Latest output is visible" : "Jump to latest output"
            }
            disabled={follow || !run?.logs.length}
            onClick={() => {
              setFollow(true);
              logs.current?.focus({ preventScroll: true });
            }}
          >
            <UIIcon name="arrow" size={14} />
          </button>
        </div>
        <select
          aria-label="Python run history"
          title={
            run
              ? `${pythonHistoryLabel(run)} · Run ${run.id}`
              : python.selectedRunId || "Recent Python runs"
          }
          value={python.selectedRunId || ""}
          disabled={python.submitting}
          onChange={(event) =>
            dispatch({ type: "python-run", id: event.target.value })
          }
        >
          <option value="" disabled>
            Recent runs
          </option>
          {python.selectedRunId &&
            !python.runs.some((item) => item.id === python.selectedRunId) && (
              <option value={python.selectedRunId}>
                Selected run · {python.selectedRunId.slice(0, 8)}
              </option>
            )}
          {python.runs.map((item) => (
            <option key={item.id} value={item.id} title={`Run ${item.id}`}>
              {pythonHistoryLabel(item)}
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
          {!!line && freshness === "current" && (
            <button onClick={() => onLocate(line)}>Go to line {line} ↗</button>
          )}{" "}
          <button
            disabled={!!repairingId}
            onClick={async () => {
              if (repairLock.current) return;
              repairLock.current = true;
              setRepairingId(run.id);
              setRepairError(null);
              try {
                await onRepair(run);
              } catch (problem) {
                setRepairError({
                  id: run.id,
                  message:
                    problem instanceof Error
                      ? problem.message
                      : "Cannot prepare repair request.",
                });
              } finally {
                repairLock.current = false;
                setRepairingId(null);
              }
            }}
          >
            {repairingId === run.id
              ? "Preparing…"
              : repairingId
                ? "Preparing another run…"
                : "Ask Agent to fix"}
          </button>
          {repairError?.id === run.id && (
            <p role="alert">{repairError.message}</p>
          )}
        </section>
      )}
      {run && freshness && freshness !== "current" && (
        <div className={"fq-result-freshness " + freshness} role="status">
          <span aria-hidden="true">{freshness === "changed" ? "◷" : "◇"}</span>
          {freshness === "changed"
            ? working
              ? "Code changed · This run uses its submitted snapshot."
              : "Code changed · These results are from an earlier snapshot. Run again to update."
            : freshness === "other-file"
              ? `Saved run · ${run.project?.entry}. Your current file is unchanged.`
              : "Saved project snapshot · Current dependencies have not been verified."}
        </div>
      )}
      {!!run?.experiments?.length && (
        <section
          className="fq-python-experiments"
          aria-label="Saved Python experiments"
          title="Linked to this run's source snapshot. Opening an experiment preserves your editor draft."
        >
          <div className="fq-run-completion">
            <span className="fq-run-completion-mark" aria-hidden="true">
              {run.collection_status === "completed" ? "✓" : "◇"}
            </span>
            <span>
              <strong>
                {run.collection_status === "completed" &&
                run.status === "completed"
                  ? "Run complete"
                  : "Saved outputs"}
              </strong>
              <small>
                {run.experiments.length}{" "}
                {run.experiments.length === 1 ? "experiment" : "experiments"} ·{" "}
                {run.collection_status === "partial"
                  ? "Some files need attention"
                  : "Recorded from this run"}
              </small>
            </span>
            {!compact && researchAction}
          </div>
          {run.experiments.map((reference) => (
            <div
              className="fq-python-experiment"
              role="group"
              aria-label={reference.filename}
              key={reference.id}
            >
              <span
                title={`${reference.filename} · SHA-256 ${reference.sha256} · run ${run.id}`}
              >
                {reference.filename}
                <small>
                  {" "}
                  ·{" "}
                  {python.previews[reference.id]?.status === "loading"
                    ? "Loading preview…"
                    : python.previews[reference.id]?.status === "failed"
                      ? "Preview failed"
                      : python.previews[reference.id]?.status === "loaded"
                        ? "Loaded in Quantum"
                        : "Saved · preview pending"}
                </small>
              </span>
              <button
                className="fq-run-open-circuit"
                disabled={python.previews[reference.id]?.status !== "loaded"}
                onClick={() =>
                  void python.openExperiment(reference.id, "program")
                }
              >
                View circuit ↗
              </button>
              {reference.has_result ? (
                <button
                  disabled={python.previews[reference.id]?.status !== "loaded"}
                  onClick={() =>
                    void python.openExperiment(reference.id, "jobs")
                  }
                >
                  View result ↗
                </button>
              ) : (
                <small>Circuit only · no saved result</small>
              )}
              {python.previews[reference.id]?.status === "failed" && (
                <span role="alert">
                  {python.previews[reference.id].error}{" "}
                  <button onClick={python.retryLoading}>Retry loading</button>
                </span>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="fq-python-result-toolbar" hidden={!run}>
        {compact && researchAction}
        {run?.collection_errors?.some((item) => item.file_id) && (
          <button
            disabled={
              python.recovering ||
              python.importing ||
              run?.collection_status === "collecting"
            }
            onClick={() => void python.recollect()}
          >
            {python.recovering ? "Retrying collection…" : "Retry collection"}
          </button>
        )}

        <input
          hidden
          type="file"
          accept=".fqx"
          ref={upload}
          aria-label="Import saved experiment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void python.importFile(file);
            event.target.value = "";
          }}
        />
        {run && (
          <details className="fq-python-run-details">
            <summary>Run details</summary>
            <div>
              {pythonRunTime(run.created_at) && (
                <small>Submitted {pythonRunTime(run.created_at)}</small>
              )}{" "}
              {run?.project && (
                <small>
                  {run.project.name} / {run.project.entry} ·{" "}
                  {run.project.files.length} frozen input files ·{" "}
                  {run.project.snapshot_hash.slice(0, 8)}
                </small>
              )}
              {run && (
                <small>
                  Run {run.id.slice(0, 8)} · execution{" "}
                  {run.execution_status || run.status} · collection{" "}
                  {run.collection_status || "pending"}
                </small>
              )}
              <small>
                {run?.runtime
                  ? `Python ${run.runtime.python} · ${run.environment.transport}`
                  : `${python.environment?.transport || "Configured environment"} · Python task`}
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
            </div>
          </details>
        )}
        {run?.collection_status === "collecting" && (
          <small role="status">Collecting saved experiments…</small>
        )}
        {["running", "queued"].includes(run?.status || "") && (
          <button
            className="fq-python-stop"
            disabled={python.stopping}
            onClick={() => void python.cancel()}
          >
            {python.stopping ? "Stopping…" : "Stop"}
          </button>
        )}
        {run?.artifact && (
          <button onClick={python.openCircuit}>Open circuit ↗</button>
        )}
        {run?.artifact?.job && (
          <button onClick={python.openResults}>View results ↗</button>
        )}
      </div>
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
          <p>
            {run.collection_errors.some((item) => item.file_id)
              ? "Complete files are retained locally. Retry parsing them without executing Python."
              : "No complete file was retained for these errors. Import an original .fqx file or rerun the script."}
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
        <div className="fq-python-request-error" role="alert">
          {error}
          {!run && python.selectedRunId && (
            <button onClick={python.retryLoading}>Retry loading</button>
          )}
        </div>
      )}
      {copyStatus === "error" && (
        <div
          className="fq-python-request-error fq-console-copy-error"
          role="alert"
        >
          Cannot copy output. Select the logs to copy manually, or check your
          browser's clipboard permission.
        </div>
      )}
      <pre
        ref={logs}
        className="fq-python-logs"
        aria-label="Python console output"
        aria-live="off"
        tabIndex={0}
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
          <span className="muted">{feedback.message}</span>
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
            You can also import an existing .fqx file; it will be labeled as a
            separate import.
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
