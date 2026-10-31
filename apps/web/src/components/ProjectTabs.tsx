import { CloseButton } from "./CloseButton";
import { projectDirty } from "../state/project-workspace";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
export function ProjectTabs({
  state,
  dispatch,
}: {
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
              {projectDirty(tab) ? " ●" : ""}
              {tab.editorLink.incoming ? " ↺" : ""}
            </button>
            <CloseButton
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
