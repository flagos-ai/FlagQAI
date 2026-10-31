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
type Review = {
  id: string;
  revision: string;
  mode: "incoming" | "synced";
  draft: string;
  before: string;
  incoming: string;
  merged: string;
};
export function EditorSyncBar({
  state,
  dispatch,
  sync,
  reviewRequest,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  sync: EditorSync;
  reviewRequest?: { id: string; sequence: number };
}) {
  const [review, setReview] = useState<Review | null>(null);
  const link = state.editorLink,
    change = link?.change;
  const stale =
    !!review &&
    (state.source !== review.draft ||
      link?.id !== review.id ||
      (review.mode === "incoming"
        ? link.incoming?.revision !== review.revision
        : !!link.incoming || change?.revision !== review.revision));
  const canUndo =
    !!change &&
    !link?.incoming &&
    state.source === change.after &&
    ["pending", "accepted"].includes(change.outcome);
  const open = () => {
    if (!link) return;
    if (link.incoming)
      setReview({
        id: link.id,
        revision: link.incoming.revision,
        mode: "incoming",
        draft: state.source,
        before: state.source,
        incoming: link.incoming.source,
        merged: state.source,
      });
    else if (change)
      setReview({
        id: link.id,
        revision: change.revision,
        mode: "synced",
        draft: state.source,
        before: change.before,
        incoming: change.agentSource ?? change.after,
        merged: state.source,
      });
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
    if (!review || stale) return;
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
    if (!link || !change || stale) return;
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
        <span role="status">
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
          <button disabled={sync.sharing} onClick={() => void sync.share()}>
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
                {state.name}.{state.language === "python" ? "py" : "qasm"} ·{" "}
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
              : "These changes have synced to the editor. Accept records your review; keeping your version restores the previous code when the editor has no newer edits."}{" "}
            Decisions update the browser draft only.
          </p>
          <CodeDiff
            before={review.before}
            after={review.incoming}
            language={state.language || "qasm"}
          />
          {review.mode === "synced" && review.draft !== change?.after && (
            <p className="fq-review-notice">
              You edited the code after synchronization. Your current draft will
              be preserved. Direct undo is disabled.
            </p>
          )}
          {review.mode === "incoming" && (
            <details className="fq-review-merge">
              <summary>Edit a merged version</summary>
              <label>
                Reviewed code
                <textarea
                  aria-label="Reviewed merged code"
                  value={review.merged}
                  onChange={(event) =>
                    setReview({ ...review, merged: event.target.value })
                  }
                />
              </label>
              <button
                className="primary"
                disabled={stale}
                onClick={() => resolve(review.merged)}
              >
                Apply reviewed code
              </button>
            </details>
          )}
          {stale && (
            <p role="alert" className="fq-review-notice">
              The editor or Agent file changed while this review was open.
              Refresh the comparison before applying a decision.
            </p>
          )}
          <footer>
            {stale ? (
              <button onClick={open} disabled={!link?.incoming && !change}>
                Refresh comparison
              </button>
            ) : review.mode === "incoming" ? (
              <>
                <button onClick={() => resolve(review.draft)}>
                  Keep my draft
                </button>
                <button
                  className="primary"
                  onClick={() => resolve(review.incoming)}
                >
                  Accept Agent changes
                </button>
              </>
            ) : (
              <>
                {change?.outcome === "pending" && (
                  <>
                    <button onClick={() => decide("keep")}>
                      {review.draft === review.incoming
                        ? "Keep my version"
                        : "Keep my draft"}
                    </button>
                    <button
                      className="primary"
                      onClick={() => decide("accept")}
                    >
                      Accept changes
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
