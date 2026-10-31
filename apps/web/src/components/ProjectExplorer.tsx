import { useState } from "react";
import type { ProjectWorkspace } from "../hooks/useProjectWorkspace";
import type {
  WorkspaceState,
  WorkspaceAction,
} from "../contracts/quantum-workspace";
export function ProjectExplorer({
  state,
  workspace,
  dispatch,
}: {
  dispatch: React.Dispatch<WorkspaceAction>;
  state: WorkspaceState;
  workspace: ProjectWorkspace;
}) {
  const [path, setPath] = useState("."),
    [file, setFile] = useState("");
  const project = state.project;
  return (
    <div className="fq-library-body fq-project-explorer">
      <label>
        Project directory
        <input
          aria-label="Project directory"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="experiments/bell"
        />
      </label>
      <div className="fq-project-actions">
        <button
          disabled={workspace.busy}
          onClick={() => void workspace.openProject(path)}
        >
          Open folder
        </button>
        <button
          disabled={workspace.busy || path === "."}
          onClick={() => void workspace.openProject(path, true)}
        >
          Create folder
        </button>
      </div>
      <small>
        Relative to{" "}
        <span title={workspace.registry.workspace_root}>
          {workspace.registry.workspace_root || "configured Agent workspace"}
        </span>
      </small>
      {!!workspace.registry.projects.length && (
        <select
          aria-label="Recent project"
          value={project?.path || ""}
          onChange={(event) => {
            setPath(event.target.value);
            void workspace.openProject(event.target.value);
          }}
        >
          <option value="" disabled>
            Recent projects
          </option>
          {workspace.registry.projects.map((item) => (
            <option key={item.id} value={item.path}>
              {item.path}
            </option>
          ))}
        </select>
      )}
      {workspace.error && <p role="alert">{workspace.error}</p>}
      {project && (
        <>
          <small className="eyebrow" title={project.root}>
            {project.name} · {project.path}
          </small>
          <form
            className="fq-project-create"
            onSubmit={(event) => {
              event.preventDefault();
              void workspace.createFile(file).then((saved) => {
                if (saved) setFile("");
              });
            }}
          >
            <input
              aria-label="New project file"
              placeholder="src/main.py"
              value={file}
              onChange={(event) => setFile(event.target.value)}
            />
            <button
              aria-label="Create project file"
              disabled={workspace.busy || !file}
            >
              ＋
            </button>
          </form>
          <div className="fq-project-tree" aria-label="Project files">
            {project.files?.map((item) => (
              <button
                className={
                  state.editorLink?.project?.path === item.path &&
                  state.editorLink.project.id === project.id
                    ? "selected"
                    : ""
                }
                key={item.path}
                aria-label={`Open ${item.path}`}
                title={item.path}
                disabled={workspace.busy}
                style={{
                  paddingLeft: 10 + (item.path.split("/").length - 1) * 12,
                }}
                onClick={() => void workspace.openFile(item.path)}
              >
                <span>{item.kind === "artifact" ? "◇" : "〈〉"}</span>{" "}
                {item.path.split("/").at(-1)}
                <small>
                  {item.kind === "artifact"
                    ? ".fqx · read-only"
                    : item.path.includes("/")
                      ? item.path
                      : ""}
                </small>
              </button>
            ))}
          </div>
          {state.programs.filter(
            (program) => program.origin?.project?.id === project.id,
          ).length > 0 && (
            <>
              <small className="eyebrow">RECENT RUN OUTPUTS</small>
              {state.programs
                .filter((program) => program.origin?.project?.id === project.id)
                .map((program) => (
                  <button
                    key={program.id}
                    onClick={() => {
                      dispatch({ type: "program", id: program.id });
                      dispatch({ type: "navigate", page: "program" });
                    }}
                  >
                    {program.experiment?.filename || program.name}
                    <small>
                      {program.origin?.project?.entry} ·{" "}
                      {program.origin?.run_id?.slice(0, 8)}
                    </small>
                  </button>
                ))}
            </>
          )}
          {!project.files?.length && (
            <p>
              Create a Python or OpenQASM file to start. Agent-created files
              appear here automatically.
            </p>
          )}
          {project.truncated && (
            <p role="status">
              Showing a bounded file list. Open a smaller project directory to
              run it.
            </p>
          )}
          {!!project.errors?.length && (
            <details>
              <summary>Unavailable files</summary>
              {project.errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}
