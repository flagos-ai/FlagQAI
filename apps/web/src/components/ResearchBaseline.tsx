import { useRef, useState } from "react";
import {
  researchRunsAPI,
  type BaselineDecision,
  type ProjectBaseline,
  type ResearchRun,
} from "../api/research-runs";
import { Modal } from "./Modal";

export function ResearchBaseline({
  run,
  baseline,
  onOpen,
  onChange,
  onReload,
}: {
  run: ResearchRun;
  baseline: ProjectBaseline;
  onOpen: (id: string) => void;
  onChange: (baseline: ProjectBaseline) => void;
  onReload: () => void;
}) {
  const [pending, setPending] = useState<BaselineDecision>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const source = run.exports.find(
    ({ name }) => name === "candidate.kmx",
  )?.sha256;
  const current = baseline.current;
  const previouslyAdopted = baseline.history.some(
    ({ target }) => target.run_id === run.id && target.source_sha256 === source,
  );
  const decision = previouslyAdopted ? "restore" : "adopt";
  const verb = pending?.decision === "restore" ? "Restore" : "Adopt";

  const close = () => {
    if (lock.current) return;
    setPending(undefined);
    setError("");
  };
  const submit = async () => {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { baseline } = await researchRunsAPI.baseline(run.id, pending);
      onChange(baseline);
      setPending(undefined);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not confirm the baseline decision.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="fq-project-baseline" aria-label="Project baseline">
      <strong>Project baseline · revision {baseline.revision}</strong>
      {run.is_project_baseline ? (
        <p role="status">This version is the current baseline.</p>
      ) : current ? (
        <p>
          <button className="link" onClick={() => onOpen(current.run_id)}>
            Open current baseline
          </button>
          {typeof current.metrics.score === "number" &&
            ` · Cost ${current.metrics.score.toLocaleString("en-US", { maximumFractionDigits: 3 })}`}
        </p>
      ) : (
        <p>No baseline adopted yet.</p>
      )}
      {!run.is_project_baseline && run.status === "completed" && source && (
        <button
          className="secondary"
          onClick={() =>
            setPending({
              decision,
              source_sha256: source,
              expected_project_revision: baseline.revision,
              request_id: crypto.randomUUID(),
            })
          }
        >
          {decision === "restore"
            ? "Restore this version"
            : "Adopt verified candidate"}
        </button>
      )}
      {!!baseline.history.length && (
        <details>
          <summary>
            Baseline history · {baseline.history.length} decisions
          </summary>
          <ol>
            {[...baseline.history].reverse().map((event) => (
              <li key={event.revision}>
                r{event.revision} ·{" "}
                {event.action === "restore" ? "Restored" : "Adopted"}{" "}
                <button
                  className="link"
                  onClick={() => onOpen(event.target.run_id)}
                >
                  Run {event.target.run_id.slice(-8)}
                </button>
                {" · "}
                <time dateTime={event.at}>
                  {new Date(event.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        </details>
      )}
      {pending && (
        <Modal
          className="fq-research-baseline-dialog"
          label={verb + " project baseline"}
          onClose={close}
        >
          <header>
            <h2>{verb} project baseline</h2>
          </header>
          <p>
            {run.title} · Run {run.id.slice(-8)}
          </p>
          <p>
            Source{" "}
            <code title={pending.source_sha256}>
              {pending.source_sha256.slice(0, 12)}
            </code>
            {" · "}Current revision {pending.expected_project_revision}
          </p>
          {error && (
            <p role="alert">
              {error}{" "}
              <button
                className="link"
                onClick={() => {
                  close();
                  onReload();
                }}
              >
                Reload baseline
              </button>
            </p>
          )}
          <footer>
            <button disabled={busy} onClick={close}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : `Confirm ${pending.decision}`}
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
