import { CloseButton } from "./CloseButton";
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
  if (!state.project) return null;
  return (
    <div className="fq-project-tabs" aria-label="Open project files">
      <button
        className={!state.activeProjectTab ? "selected" : ""}
        onClick={() => dispatch({ type: "project-tab" })}
      >
        Scratch
      </button>
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
  );
}
