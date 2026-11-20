import { useEffect, useState } from "react";
import { pythonAPI, type RunEnvironmentChecks } from "../api/python-runs";

/** Environment observations are separate from the original run and its results. */
export function RecordedEnvironmentChecks({
  runId,
  running,
}: {
  runId: string;
  running: boolean;
}) {
  const [history, setHistory] = useState<RunEnvironmentChecks>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setHistory(undefined);
    setError("");
    void pythonAPI.environmentChecks(runId, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setHistory(value);
      },
      () => {
        if (!controller.signal.aborted)
          setError(
            "Cannot load environment check history. Recorded results are retained.",
          );
      },
    );
    return () => controller.abort();
  }, [runId]);
  const latest = history?.checks[0];
  async function check() {
    setPending(true);
    setError("");
    try {
      setHistory(await pythonAPI.recheckEnvironment(runId));
    } catch {
      setError(
        "Environment check could not be confirmed. Reopen this record to load saved observations. No research run was submitted.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label="Recorded input environment checks">
      <button
        type="button"
        disabled={pending || running || !history}
        onClick={() => void check()}
      >
        {pending ? "Checking recorded inputs…" : "Recheck environment"}
      </button>
      <p>
        Checks frozen inputs in the selected environment. Does not run research
        code, install dependencies, or replace results.
      </p>
      {error && <p role="alert">{error}</p>}
      {!error && !history && (
        <p role="status">Loading environment check history…</p>
      )}
      {history && (
        <p role="status">
          {latest
            ? `${latest.status === "ready" ? "Required imports and SDK APIs available" : latest.status.replaceAll("_", " ")} · ${latest.same_environment_selection ? "checked this service session" : "archived observation; check the selected environment again"}`
            : "No later environment check recorded. The pre-run check above is historical."}
        </p>
      )}
      {!!history?.checks.length && (
        <details>
          <summary>Environment check history · {history.checks.length}</summary>
          <ul>
            {history.checks.map((item) => (
              <li key={item.id}>
                <time dateTime={new Date(item.checked_at * 1000).toISOString()}>
                  {new Date(item.checked_at * 1000).toLocaleString()}
                </time>
                {` · ${item.status.replaceAll("_", " ")} · ${item.transport} · Python ${item.runtime?.python || "not recorded"} · FlagQuantum ${item.runtime?.sdk_version || "not recorded"}`}
                {" · "}
                <code title={item.source_hash}>
                  {item.source_hash.slice(0, 12)}
                </code>
                {item.error && <p>{item.error}</p>}
                {[
                  ...(item.missing_dependencies || []),
                  ...(item.incompatible_sdk || []),
                ].map((issue) => (
                  <p key={issue.name}>
                    {issue.name}: {issue.detail}
                  </p>
                ))}
                {item.status !== "ready" && item.preparation && (
                  <details>
                    <summary>Prepare environment</summary>
                    <p>{item.preparation.guidance}</p>
                    <pre>{item.preparation.commands}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
