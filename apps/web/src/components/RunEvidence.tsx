import { useEffect, useState } from "react";
import { pythonAPI, type PythonRun } from "../api/python-runs";
import { experimentFileURL } from "../api/experiments";
import { CodeExample } from "./CodeExample";
import { RecordedEnvironmentChecks } from "./RecordedEnvironmentChecks";

/** Read the original run; never restore an editor or submit another execution. */
export function RunEvidence({
  run,
  runId,
}: {
  run?: PythonRun;
  runId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<PythonRun>();
  const [error, setError] = useState("");
  useEffect(() => {
    setLoaded(undefined);
    setError("");
    if (!open || run || !runId) return;
    const request = new AbortController();
    void pythonAPI.read(runId, request.signal).then(
      (value) => {
        if (!request.signal.aborted) setLoaded(value);
      },
      () => {
        if (!request.signal.aborted)
          setError(
            "Original run unavailable. The saved experiment is retained.",
          );
      },
    );
    return () => request.abort();
  }, [open, run, runId]);
  const value = run || loaded;
  if (!run && !runId) return null;
  const check = value?.notebook_environment;
  const inputsMatch =
    check?.status === "ready" &&
    check.source_hash === value?.project?.snapshot_hash;
  return (
    <details
      className="fq-run-evidence"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Recorded run evidence</summary>
      {open && (
        <div>
          {error ? (
            <p role="alert">{error}</p>
          ) : !value ? (
            <p role="status">Loading original run…</p>
          ) : (
            <>
              <p>
                Execution:{" "}
                <strong>{value.execution_status || value.status}</strong>
                {" · "}Collection: {value.collection_status || "not recorded"}
              </p>
              <p>
                Input version{" "}
                <code title={value.project?.snapshot_hash || value.source_hash}>
                  {(value.project?.snapshot_hash || value.source_hash)?.slice(
                    0,
                    12,
                  ) || "not recorded"}
                </code>
                {value.project &&
                  ` · ${value.project.files.length} files · ${value.project.entry}`}
              </p>
              <p>
                {value.environment.transport} · Python{" "}
                {value.runtime?.python || "version not recorded"} · FlagQuantum{" "}
                {value.runtime?.sdk_version || "version not recorded"}
              </p>
              <p>
                {inputsMatch
                  ? "Required imports and SDK APIs checked for these inputs before execution."
                  : check
                    ? "Environment check does not match these recorded inputs."
                    : "No notebook environment check recorded for this run."}{" "}
                Execution and file collection are not scientific validation.
              </p>
              <RecordedEnvironmentChecks
                key={value.id}
                runId={value.id}
                running={
                  value.status === "queued" || value.status === "running"
                }
              />
              <a
                href={`/api/python/runs/${encodeURIComponent(value.id)}/evidence`}
                download="run-evidence.json"
              >
                Download run record and input files ↓
              </a>
              {!!value.experiments?.length && (
                <ul aria-label="Recorded output files">
                  {value.experiments.map((file) => (
                    <li key={file.id}>
                      <a
                        href={experimentFileURL(file.id)}
                        download={file.filename}
                      >
                        {file.filename}
                      </a>
                      {" · "}
                      <code title={file.sha256}>
                        {file.sha256.slice(0, 12)}
                      </code>
                      {file.has_result ? " · result saved" : " · circuit only"}
                    </li>
                  ))}
                </ul>
              )}
              {!!value.collection_errors?.length && (
                <p role="alert">
                  Collection issues:{" "}
                  {value.collection_errors
                    .map(
                      (item) =>
                        `${item.filename || "File scan"}: ${item.message}`,
                    )
                    .join("; ")}
                </p>
              )}
              {value.error && <p role="alert">{value.error}</p>}
              <details>
                <summary>
                  Recorded logs{value.truncated ? " · truncated at 64 KiB" : ""}
                </summary>
                <pre>
                  {value.logs.map((item) => item.text).join("") ||
                    "No console output recorded."}
                </pre>
              </details>
              <details>
                <summary>Recorded entry source</summary>
                <CodeExample
                  title={value.project?.entry || "main.py"}
                  code={value.source}
                  language="python"
                />
              </details>
            </>
          )}
        </div>
      )}
    </details>
  );
}
