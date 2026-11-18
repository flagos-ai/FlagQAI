import { useEffect, useRef, useState } from "react";
import {
  researchRunsAPI,
  type CandidateDecision,
  type ResearchRun,
} from "../api/research-runs";
import { Modal } from "./Modal";

type Decision = CandidateDecision["decision"];

function decisionId(key: string) {
  const created = crypto.randomUUID();
  try {
    const saved = sessionStorage.getItem(key);
    if (saved && /^[a-f0-9-]{36}$/.test(saved)) return saved;
    sessionStorage.setItem(key, created);
  } catch {
    // Repeated attempts in this dialog still share the generated ID.
  }
  return created;
}

export function ResearchCandidateDecision({
  run,
  sourceHash,
  projectRevision,
  onChange,
  onReload,
}: {
  run: ResearchRun;
  sourceHash: string;
  projectRevision: number;
  onChange: (run: ResearchRun) => void;
  onReload: () => void;
}) {
  const [pending, setPending] = useState<{
    key: string;
    payload: CandidateDecision;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const open = (decision: Decision) => {
    const key = `fq-candidate-decision-v1:${run.id}:${sourceHash}:${projectRevision}:${decision}`;
    setPending({
      key,
      payload: {
        decision,
        request_id: decisionId(key),
        source_sha256: sourceHash,
        expected_project_revision: projectRevision,
      },
    });
    setError("");
  };
  const close = () => {
    if (locked.current) return;
    setError("");
    setPending(undefined);
  };
  const submit = async () => {
    if (!pending || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await researchRunsAPI.decide(run.id, pending.payload);
      if (result.run?.id !== run.id)
        throw Error("Could not confirm the saved decision.");
      try {
        sessionStorage.removeItem(pending.key);
      } catch {
        // The server can still reconcile this request.
      }
      if (active.current) {
        setPending(undefined);
        onChange(result.run);
      }
    } catch (problem) {
      if (active.current)
        setError(
          problem instanceof Error
            ? problem.message
            : "Could not save this decision.",
        );
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };

  if (run.proposal?.project_revision !== projectRevision)
    return (
      <p role="status">
        The baseline changed. Open the parent run and stage a revision against
        the current baseline.
      </p>
    );

  const verifying = pending?.payload.decision === "verify";
  const title = verifying ? "Verify candidate" : "Reject candidate";
  return (
    <section className="fq-candidate-decision" aria-label="Candidate review">
      <button className="primary" onClick={() => open("verify")}>
        Verify candidate
      </button>
      <button onClick={() => open("reject")}>Reject candidate</button>
      {pending && (
        <Modal
          className="fq-research-verification-dialog"
          label={title}
          onClose={close}
        >
          <header>
            <h2>{title}</h2>
          </header>
          <p>
            Run {run.id.slice(-8)} · Baseline revision {projectRevision}
          </p>
          <p>
            Source <code title={sourceHash}>{sourceHash.slice(0, 12)}</code>
          </p>
          <p>
            {verifying
              ? "Start the full InvSqrt verifier in the local Python environment."
              : "Record this candidate as rejected. Its changes remain in the research history."}
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
                Reload review
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
              {busy
                ? "Saving…"
                : verifying
                  ? "Start verification"
                  : "Confirm rejection"}
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
