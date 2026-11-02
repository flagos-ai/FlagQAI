import { CloseButton } from "./CloseButton";
import { useState } from "react";
import { Modal } from "./Modal";
import { projectDirty, projectNeedsReview } from "../state/project-workspace";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
export function ProjectTabs({
  state,
  dispatch,
  onReview,
}: {
  onReview: (id: string) => void;
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const [showDrafts, setShowDrafts] = useState(false);
  const retained = (state.projectTabs || []).filter(
    (tab) => tab.closed && (projectDirty(tab) || tab.editorLink.incoming),
  );
  if (!state.project) return null;
  return (
    <>
      <div className="fq-project-tabs" aria-label="Open project files">
        <button
          className={!state.activeProjectTab ? "selected" : ""}
          onClick={() => dispatch({ type: "project-tab" })}
        >
          Scratch
        </button>
        {!!retained.length && (
          <button
            className="fq-retained-drafts"
            aria-label={`Retained drafts (${retained.length})`}
            title="Reopen closed files with retained drafts"
            onClick={() => setShowDrafts(true)}
          >
            Drafts · {retained.length}
          </button>
        )}
        {state.projectTabs
          ?.filter((tab) => !tab.closed)
          .map((tab) => (
            <div
              className={tab.id === state.activeProjectTab ? "selected" : ""}
              key={tab.id}
            >
              <button
                aria-label={`Switch to ${tab.path}`}
                title={`${tab.project.name} / ${tab.path}`}
                onClick={() => dispatch({ type: "project-tab", id: tab.id })}
              >
                {tab.path.split("/").at(-1)}
                {projectDirty(tab) && (
                  <span
                    className="fq-tab-unsaved"
                    title="Unsaved changes"
                    aria-label="Unsaved changes"
                  />
                )}
              </button>
              {projectNeedsReview(tab) && (
                <button
                  className="fq-tab-review"
                  aria-label={`Review changes in ${tab.path}`}
                  title={
                    tab.editorLink.incoming
                      ? "Agent changes available · Your draft is protected"
                      : "Updated by Agent · Review changes"
                  }
                  onClick={() => onReview(tab.id)}
                >
                  <span aria-hidden="true" />
                </button>
              )}
              <CloseButton
                title="Close tab · Draft retained"
                label={`Close ${tab.path} (draft retained)`}
                onClick={() =>
                  dispatch({ type: "project-close-tab", id: tab.id })
                }
              />
            </div>
          ))}
      </div>
      {showDrafts && (
        <Modal
          className="fq-attachment-preview fq-retained-draft-dialog"
          label="Retained project drafts"
          onClose={() => setShowDrafts(false)}
        >
          <header>
            <h2>Retained drafts</h2>
            <CloseButton
              label="Close retained drafts"
              onClick={() => setShowDrafts(false)}
            />
          </header>
          <p>
            Your closed drafts are kept here. Reopen a file to continue editing.
          </p>
          {retained.length ? (
            <div className="fq-retained-draft-list">
              {retained.map((tab) => (
                <button
                  key={tab.id}
                  aria-label={`Reopen ${tab.project.name} / ${tab.path}`}
                  onClick={() => {
                    setShowDrafts(false);
                    dispatch({ type: "project-tab", id: tab.id });
                  }}
                >
                  <strong>{tab.path}</strong>
                  <small>
                    {tab.project.name} ·{" "}
                    {projectDirty(tab) ? "Unsaved changes" : "Saved code"}
                    {tab.editorLink.incoming
                      ? " · Agent changes to review"
                      : ""}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p>No closed drafts to recover.</p>
          )}
        </Modal>
      )}
    </>
  );
}
