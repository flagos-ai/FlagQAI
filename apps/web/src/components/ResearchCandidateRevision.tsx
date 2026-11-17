import { useEffect, useRef, useState } from "react";
import {
  ResearchRequestError,
  researchRunsAPI,
  type CandidateRevision,
  type ResearchRun,
} from "../api/research-runs";

type Draft = Pick<
  CandidateRevision,
  "before" | "after" | "reason" | "request_id"
> & {
  submittedRevision?: number;
};

function restoreDraft(key: string): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (
      saved &&
      typeof saved.before === "string" &&
      saved.before.length <= 16384 &&
      typeof saved.after === "string" &&
      saved.after.length <= 16384 &&
      typeof saved.reason === "string" &&
      saved.reason.length <= 4000 &&
      typeof saved.request_id === "string" &&
      saved.request_id.length > 0 &&
      saved.request_id.length <= 128
    )
      return {
        before: saved.before,
        after: saved.after,
        reason: saved.reason,
        request_id: saved.request_id,
        submittedRevision:
          Number.isSafeInteger(saved.submittedRevision) &&
          saved.submittedRevision >= 0
            ? saved.submittedRevision
            : undefined,
      };
  } catch {
    // The form also works without local storage.
  }
  return { before: "", after: "", reason: "", request_id: crypto.randomUUID() };
}

export function ResearchCandidateRevision({
  run,
  sourceHash,
  projectRevision,
  onOpen,
  onReload,
}: {
  run: ResearchRun;
  sourceHash: string;
  projectRevision: number;
  onOpen: (id: string) => void;
  onReload: () => void;
}) {
  const key = `fq-research-revision-v1:${run.id}:${sourceHash}`;
  const [draft, setDraft] = useState(() => restoreDraft(key));
  const [expanded, setExpanded] = useState(
    () => !!(draft.before || draft.after || draft.reason),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const locked = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const save = (next: Draft) => {
    setDraft(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep the current input available in memory.
    }
  };
  const edit = (field: "before" | "after" | "reason", value: string) => {
    save({
      ...draft,
      [field]: value,
      submittedRevision: undefined,
      request_id: crypto.randomUUID(),
    });
    setConflict(false);
    setError("");
  };
  const submit = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setConflict(false);
    const expected = draft.submittedRevision ?? projectRevision;
    save({ ...draft, submittedRevision: expected });
    try {
      const { research_run } = await researchRunsAPI.revise(run.id, {
        before: draft.before,
        after: draft.after,
        reason: draft.reason,
        request_id: draft.request_id,
        parent_sha256: sourceHash,
        expected_project_revision: expected,
      });
      if (!/^invsqrt-[a-f0-9]{32}$/.test(research_run?.id))
        throw Error(
          "Could not confirm the saved candidate. Retry with the same draft.",
        );
      try {
        if (restoreDraft(key).request_id === draft.request_id)
          localStorage.removeItem(key);
      } catch {
        // The saved candidate is available even if draft cleanup fails.
      }
      if (active.current) onOpen(research_run.id);
    } catch (problem) {
      if (active.current) {
        setError(
          problem instanceof Error
            ? problem.message
            : "Cannot stage this revision.",
        );
        setConflict(
          problem instanceof ResearchRequestError && problem.status === 409,
        );
      }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <details
      className="fq-candidate-revision"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Continue with a new revision</summary>
      <p>Replace one uniquely matching text region and save it for review.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          Text to replace
          <textarea
            value={draft.before}
            maxLength={16384}
            required
            disabled={busy}
            onChange={(event) => edit("before", event.target.value)}
          />
        </label>
        <label>
          Replacement
          <textarea
            value={draft.after}
            maxLength={16384}
            disabled={busy}
            onChange={(event) => edit("after", event.target.value)}
          />
        </label>
        <label>
          Reason
          <input
            value={draft.reason}
            maxLength={4000}
            required
            disabled={busy}
            onChange={(event) => edit("reason", event.target.value)}
          />
        </label>
        {error && (
          <p role="alert">
            {error}{" "}
            {conflict && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  save({
                    ...draft,
                    submittedRevision: undefined,
                    request_id: crypto.randomUUID(),
                  });
                  onReload();
                }}
              >
                Reload baseline
              </button>
            )}
          </p>
        )}
        <button
          className="secondary"
          type="submit"
          disabled={
            busy ||
            !draft.before ||
            !draft.reason.trim() ||
            draft.before === draft.after
          }
        >
          {busy ? "Staging…" : "Stage revision"}
        </button>
      </form>
    </details>
  );
}

export function ResearchCandidateDiff({
  run,
  onOpen,
}: {
  run: ResearchRun;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const proposal = run.proposal;
  if (!proposal?.diff) return null;
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Candidate changes</summary>
      <p>
        <button className="link" onClick={() => onOpen(proposal.parent)}>
          Open parent run
        </button>
        {typeof proposal.project_revision === "number" &&
          ` · Baseline revision ${proposal.project_revision}`}
      </p>
      {expanded && <pre>{proposal.diff}</pre>}
    </details>
  );
}
