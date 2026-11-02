import {
  openAgentReview,
  reviewMatches,
  acceptReviewAction,
  type AgentReview,
  type ReviewAction,
} from "../state/agent-review";
import { UIIcon } from "./UIIcon";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { CodeDiff } from "./CodeDiff";
import type { EditorSync } from "../hooks/useEditorSync";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
export function EditorSyncBar({
  state,
  dispatch,
  sync,
  reviewRequest,
  onRunReview,
  runDisabled = false,
  runLabel = "Accept & run",
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  sync: EditorSync;
  reviewRequest?: { id: string; sequence: number };
  onRunReview: (action: ReviewAction) => Promise<void>;
  runDisabled?: boolean;
  runLabel?: string;
}) {
  const [review, setReview] = useState<AgentReview | null>(null);
  const link = state.editorLink,
    change = link?.change;
  const stale = !!review && !reviewMatches(state, review);
  const [reviewError, setReviewError] = useState(""),
    [running, setRunning] = useState(false),
    [savedVersion, setSavedVersion] = useState(false);
  const reviewLock = useRef(false);
  const settledReview =
    review?.mode === "synced" &&
    (change?.outcome === "undone" || change?.outcome === "kept");
  const canUndo =
    !!change &&
    !link?.incoming &&
    state.source === change.after &&
    ["pending", "accepted"].includes(change.outcome);
  const open = () => {
    setReview(openAgentReview(state));
    setReviewError("");
    setSavedVersion(false);
  };
  const acceptAndRun = async (source?: string) => {
    if (!review || stale || reviewLock.current || runDisabled) return;
    reviewLock.current = true;
    setRunning(true);
    setReviewError("");
    try {
      await onRunReview(acceptReviewAction(state, review, source));
      setReview(null);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      reviewLock.current = false;
      setRunning(false);
    }
  };
  const saveVersion = (source: string) => {
    if (!review || stale || running) return;
    dispatch({ type: "save-review-version", review, source });
    setSavedVersion(true);
  };
  const handledReview = useRef(0);
  useEffect(() => {
    if (
      reviewRequest &&
      reviewRequest.sequence !== handledReview.current &&
      reviewRequest.id === link?.id
    ) {
      handledReview.current = reviewRequest.sequence;
      open();
    }
  }, [reviewRequest?.id, reviewRequest?.sequence, link?.id]);
  const resolve = (source: string) => {
    if (!review || stale || running) return;
    dispatch({
      type: "resolve-file",
      id: review.id,
      revision: review.revision,
      expectedSource: review.draft,
      source,
    });
    setReview(null);
  };
  const decide = (decision: "accept" | "keep" | "undo") => {
    if (!link || !change || stale || running) return;
    dispatch({
      type: "review-agent-change",
      id: link.id,
      revision: change.revision,
      expectedSource: state.source,
      decision,
    });
    setReview(null);
  };
  const fileActions = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!fileActions.current?.contains(event.target as Node))
        fileActions.current?.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") fileActions.current?.removeAttribute("open");
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <>
      <div className={"fq-editor-sync " + (link?.incoming ? "conflict" : "")}>
        <span role="status" hidden={!link && !sync.error}>
          {sync.error ||
            (link?.project
              ? link.incoming
                ? "Agent changes available · Draft protected"
                : state.source !== link.base
                  ? "Unsaved changes"
                  : change?.outcome === "pending"
                    ? "Updated by Agent"
                    : "Saved"
              : link
                ? link.incoming
                  ? "Agent file changed · Your draft is protected"
                  : change?.outcome === "pending"
                    ? "Agent code synced · Review changes"
                    : change?.outcome === "undone"
                      ? "Agent change undone · Your version retained"
                      : change?.outcome === "kept"
                        ? "Your draft retained"
                        : state.source !== link.base
                          ? "Local draft · Incoming changes need review"
                          : change?.outcome === "accepted"
                            ? "Agent changes accepted"
                            : "Watching Agent file · Live sync"
                : "Share a model file to see Agent edits here")}
        </span>
        {link ? (
          <>
            {(link.incoming || change) && (
              <button onClick={open}>
                {link.incoming || change?.outcome === "pending"
                  ? "Review changes"
                  : "View changes"}
              </button>
            )}
            {change &&
              ["pending", "accepted"].includes(change.outcome) &&
              !link.incoming && (
                <button
                  disabled={!canUndo}
                  title={
                    canUndo
                      ? "Restore the code before the last Agent change"
                      : "The editor has newer edits; compare versions before changing it"
                  }
                  onClick={() => decide("undo")}
                >
                  Undo Agent change
                </button>
              )}
            <details className="fq-editor-file-actions" ref={fileActions}>
              <summary aria-label="File actions" title="File actions">
                <UIIcon name="more" />
              </summary>
              <div>
                <button
                  title={link.path}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(link.path)
                      .catch(() => {})
                  }
                >
                  Copy path
                </button>
                <button
                  onClick={() => {
                    dispatch(
                      link.project
                        ? { type: "project-close-tab", id: link.id }
                        : { type: "unlink-editor" },
                    );
                    setReview(null);
                  }}
                >
                  {link.project ? "Close tab" : "Disconnect file"}
                </button>
              </div>
            </details>
          </>
        ) : (
          <button
            disabled={sync.sharing}
            title="Share a model file to see Agent edits here"
            onClick={() => void sync.share()}
          >
            {sync.sharing ? "Sharing…" : "Share with Agent"}
          </button>
        )}
      </div>
      {review && (
        <Modal
          className="fq-sync-dialog"
          label="Review Agent code changes"
          onClose={() => setReview(null)}
        >
          <header>
            <div>
              <h2>Review Agent changes</h2>
              <small>
                {review.name}.{review.language === "python" ? "py" : "qasm"} ·{" "}
                {review.revision.slice(0, 8)}
              </small>
            </div>
            <CloseButton
              label="Close code review"
              onClick={() => setReview(null)}
            />
          </header>
          <p>
            {review.mode === "incoming"
              ? "Your draft is protected. Compare your current code with the Agent file before accepting or merging."
              : change?.outcome === "undone"
                ? "You undid this Agent change. Your previous code was restored; this comparison shows the saved proposal."
                : change?.outcome === "kept"
                  ? "You kept your version. This comparison shows the saved Agent proposal; your current draft is preserved."
                  : "These changes are already in the editor. Accept to keep them, or restore your previous code. Newer edits are protected."}{" "}
            Accepting updates the browser draft only. Running submits that exact
            reviewed snapshot without saving disk files.
          </p>
          {(review.mode === "incoming" || review.draft !== review.incoming) && (
            <details className="fq-review-base">
              <summary>
                Three-way comparison · shared base, your draft, Agent proposal
              </summary>
              <CodeDiff
                beforeLabel="Shared base"
                afterLabel="Your draft"
                before={review.base}
                after={review.draft}
                language={review.language}
              />
              <CodeDiff
                beforeLabel="Shared base"
                afterLabel="Agent proposal"
                before={review.base}
                after={review.incoming}
                language={review.language}
              />
            </details>
          )}
          <CodeDiff
            beforeLabel={
              review.mode === "incoming" ? "Your draft" : "Before change"
            }
            afterLabel="Agent proposal"
            before={review.before}
            after={review.incoming}
            language={review.language}
          />
          {review.mode === "synced" &&
            !settledReview &&
            review.draft !== change?.after && (
              <p className="fq-review-notice">
                You edited the code after synchronization. Your current draft
                will be preserved. Direct undo is disabled.
              </p>
            )}
          {review.mode === "incoming" && (
            <details className="fq-review-merge">
              <summary>Edit a merged version</summary>
              <label>
                Reviewed code
                <textarea
                  aria-label="Reviewed merged code"
                  disabled={running}
                  value={review.merged}
                  onChange={(event) =>
                    setReview({ ...review, merged: event.target.value })
                  }
                />
              </label>
              <button
                className="primary"
                disabled={stale || running}
                onClick={() => resolve(review.merged)}
              >
                Apply reviewed code
              </button>
              <button
                disabled={stale || running || runDisabled}
                onClick={() => void acceptAndRun(review.merged)}
              >
                {running
                  ? "Checking reviewed code…"
                  : "Apply & run reviewed code"}
              </button>
              <button
                disabled={stale || running}
                onClick={() => saveVersion(review.merged)}
              >
                Save reviewed version
              </button>
            </details>
          )}
          {reviewError && (
            <p role="alert" className="fq-review-notice">
              {reviewError}
            </p>
          )}
          {savedVersion && (
            <p role="status">
              Independent version added to My models. Your draft and disk file
              are unchanged.
            </p>
          )}
          {stale && (
            <p role="alert" className="fq-review-notice">
              The editor or Agent file changed while this review was open.
              Refresh the comparison before applying a decision.
            </p>
          )}
          <footer>
            {!stale && (
              <button
                disabled={running}
                onClick={() => saveVersion(review.incoming)}
              >
                Save proposal as independent version
              </button>
            )}
            {stale ? (
              <button onClick={open} disabled={!link?.incoming && !change}>
                Refresh comparison
              </button>
            ) : review.mode === "incoming" ? (
              <>
                <button
                  disabled={running}
                  onClick={() => resolve(review.draft)}
                >
                  Keep my draft
                </button>
                <button
                  disabled={running}
                  onClick={() => resolve(review.incoming)}
                >
                  Accept Agent changes
                </button>
                <button
                  className="primary"
                  disabled={running || runDisabled}
                  onClick={() => void acceptAndRun()}
                >
                  {running ? "Checking reviewed code…" : runLabel}
                </button>
              </>
            ) : (
              <>
                {change?.outcome === "pending" && (
                  <>
                    <button disabled={running} onClick={() => decide("keep")}>
                      {review.draft === review.incoming
                        ? "Keep my version"
                        : "Keep my draft"}
                    </button>
                    <button disabled={running} onClick={() => decide("accept")}>
                      Accept changes
                    </button>
                    <button
                      className="primary"
                      disabled={running || runDisabled}
                      onClick={() => void acceptAndRun()}
                    >
                      {running ? "Checking reviewed code…" : runLabel}
                    </button>
                  </>
                )}
                {change?.outcome === "accepted" && (
                  <button disabled={!canUndo} onClick={() => decide("undo")}>
                    Undo Agent change
                  </button>
                )}
                {change?.outcome !== "pending" && (
                  <button onClick={() => setReview(null)}>Done</button>
                )}
              </>
            )}
          </footer>
        </Modal>
      )}
    </>
  );
}
