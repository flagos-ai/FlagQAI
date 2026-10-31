import { useProjectFolders } from "../hooks/useProjectFolders";
import { useRef, useState } from "react";
import type { ProjectWorkspace } from "../hooks/useProjectWorkspace";
import type {
  WorkspaceState,
  WorkspaceAction,
} from "../contracts/quantum-workspace";
import type { ProjectInfo } from "../state/project-workspace";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";

type File = NonNullable<ProjectInfo["files"]>[number];
function FileTree({
  files,
  prefix = "",
  selected,
  busy,
  onOpen,
  folders,
  searching,
}: {
  files: File[];
  prefix?: string;
  selected?: string;
  busy: boolean;
  onOpen: (path: string) => void;
  folders: ReturnType<typeof useProjectFolders>;
  searching: boolean;
}) {
  const directories = [
    ...new Set(
      files
        .map((file) => file.path.slice(prefix.length))
        .filter((path) => path.includes("/"))
        .map((path) => path.split("/")[0]),
    ),
  ];
  return (
    <>
      {directories.map((folder) => (
        <details
          className="fq-project-folder"
          key={`${folder}:${searching ? "search" : "tree"}`}
          open={searching || !folders.closed.includes(prefix + folder)}
          onToggle={(event) => {
            if (!searching)
              folders.toggle(prefix + folder, !event.currentTarget.open);
          }}
        >
          <summary>{folder}</summary>
          <FileTree
            files={files.filter((file) =>
              file.path.startsWith(prefix + folder + "/"),
            )}
            prefix={prefix + folder + "/"}
            selected={selected}
            busy={busy}
            onOpen={onOpen}
            folders={folders}
            searching={searching}
          />
        </details>
      ))}
      {files
        .filter((file) => !file.path.slice(prefix.length).includes("/"))
        .map((file) => (
          <button
            key={file.path}
            aria-label={`Open ${file.path}`}
            title={file.path}
            className={selected === file.path ? "selected" : ""}
            aria-current={selected === file.path ? "true" : undefined}
            disabled={busy}
            onClick={() => onOpen(file.path)}
          >
            <span aria-hidden="true" className="fq-project-file-kind">
              {file.kind === "artifact" ? "◇" : "‹›"}
            </span>
            <span className="fq-project-file-name">
              {file.path.split("/").at(-1)}
            </span>
            {file.kind === "artifact" && (
              <small title="Read-only experiment">.fqx</small>
            )}
          </button>
        ))}
    </>
  );
}
export function ProjectExplorer({
  state,
  workspace,
  dispatch,
}: {
  dispatch: React.Dispatch<WorkspaceAction>;
  state: WorkspaceState;
  workspace: ProjectWorkspace;
}) {
  const [opening, setOpening] = useState(false),
    [mode, setMode] = useState<"open" | "create">("open"),
    [path, setPath] = useState("."),
    [file, setFile] = useState(""),
    [creating, setCreating] = useState(false),
    [query, setQuery] = useState("");
  const pathInput = useRef<HTMLInputElement>(null);
  const project = state.project;
  const folders = useProjectFolders(project?.id);
  const openProject = async (value: string, create = false) => {
    if (await workspace.openProject(value, create)) {
      setOpening(false);
      setQuery("");
    }
  };
  const outputs = state.programs.filter(
    (program) => program.origin?.project?.id === project?.id,
  );
  return (
    <div className="fq-library-body fq-project-explorer">
      {opening && (
        <Modal
          className="fq-project-dialog"
          label="Open local project"
          onClose={() => setOpening(false)}
          initialFocus={pathInput}
        >
          <header>
            <h2>{mode === "open" ? "Open project" : "New project"}</h2>
            <CloseButton
              label="Close project chooser"
              onClick={() => setOpening(false)}
            />
          </header>
          <div
            className="fq-project-mode"
            role="group"
            aria-label="Project action"
          >
            <button
              aria-pressed={mode === "open"}
              onClick={() => setMode("open")}
            >
              Open existing
            </button>
            <button
              aria-pressed={mode === "create"}
              onClick={() => {
                setMode("create");
                if (path === ".") setPath("");
              }}
            >
              Create new
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void openProject(path, mode === "create");
            }}
          >
            <label>
              Folder path
              <input
                ref={pathInput}
                aria-label="Project directory"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="experiments/bell"
              />
            </label>
            <p className="fq-project-hint">
              Choose a folder inside your local workspace. Relative and full
              paths are supported.
            </p>
            <details>
              <summary>Workspace location</summary>
              <code>
                {workspace.registry.workspace_root ||
                  "Configured Agent workspace"}
              </code>
            </details>
            {workspace.error && <p role="alert">{workspace.error}</p>}
            <footer>
              <button type="button" onClick={() => setOpening(false)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={
                  workspace.busy ||
                  !path.trim() ||
                  (mode === "create" && path === ".")
                }
              >
                {workspace.busy
                  ? "Opening…"
                  : mode === "create"
                    ? "Create folder"
                    : "Open folder"}
              </button>
            </footer>
          </form>
          {!!workspace.registry.projects.length && mode === "open" && (
            <section className="fq-project-recents">
              <small className="eyebrow">RECENT PROJECTS</small>
              {workspace.registry.projects.map((item) => (
                <button
                  key={item.id}
                  disabled={workspace.busy}
                  onClick={() => void openProject(item.path)}
                >
                  <b>{item.name}</b>
                  <small>{item.path}</small>
                </button>
              ))}
            </section>
          )}
        </Modal>
      )}
      {workspace.error && !opening && <p role="alert">{workspace.error}</p>}
      {project ? (
        <>
          <div className="fq-project-heading">
            <span title={project.root}>
              <b>{project.name}</b>
              <small>Local project</small>
            </span>
            <button
              aria-label="Change project"
              title="Open another project"
              onClick={() => {
                setPath(project.path);
                setMode("open");
                setOpening(true);
              }}
            >
              ···
            </button>
          </div>
          <div className="fq-project-file-tools">
            <input
              aria-label="Find project file"
              placeholder="Find a file…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              aria-label="New file"
              title="New Python or OpenQASM file"
              aria-expanded={creating}
              onClick={() => setCreating(!creating)}
            >
              ＋
            </button>
          </div>
          {creating && (
            <form
              className="fq-project-create"
              onSubmit={(event) => {
                event.preventDefault();
                void workspace.createFile(file).then((saved) => {
                  if (saved) {
                    setFile("");
                    setCreating(false);
                  }
                });
              }}
            >
              <input
                autoFocus
                aria-label="New project file"
                placeholder="src/main.py"
                value={file}
                onChange={(event) => setFile(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setCreating(false);
                }}
              />
              <button
                aria-label="Create project file"
                disabled={workspace.busy || !file.trim()}
              >
                Add
              </button>
            </form>
          )}
          {workspace.error && !opening && <p role="alert">{workspace.error}</p>}
          <div className="fq-project-tree" aria-label="Project files">
            <FileTree
              files={(project.files || []).filter((item) =>
                item.path.toLowerCase().includes(query.toLowerCase()),
              )}
              busy={workspace.busy}
              folders={folders}
              searching={!!query}
              selected={
                state.editorLink?.project?.id === project.id
                  ? state.editorLink.project.path
                  : undefined
              }
              onOpen={(path) => void workspace.openFile(path)}
            />
          </div>
          {!project.files?.length && (
            <div className="fq-project-empty">
              <p>Your project is ready.</p>
              <small>
                Add a Python or OpenQASM file. Files created by Agent appear
                here too.
              </small>
              <button onClick={() => setCreating(true)}>
                Create first file
              </button>
            </div>
          )}
          {!!query &&
            !project.files?.some((item) =>
              item.path.toLowerCase().includes(query.toLowerCase()),
            ) && <p className="fq-project-hint">No matching files.</p>}
          {!!outputs.length && (
            <section className="fq-project-outputs">
              <small className="eyebrow">RECENT OUTPUTS</small>
              {outputs.slice(0, 3).map((program) => (
                <button
                  key={program.id}
                  onClick={() => {
                    dispatch({ type: "program", id: program.id });
                    dispatch({ type: "navigate", page: "program" });
                  }}
                >
                  <span>◇</span>
                  <span>
                    {program.experiment?.filename || program.name}
                    <small>
                      {program.origin?.project?.entry} ·{" "}
                      {new Date(program.created).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </span>
                </button>
              ))}
              {outputs.length > 3 && (
                <button
                  onClick={() =>
                    dispatch({ type: "navigate", page: "program" })
                  }
                >
                  All outputs ↗
                </button>
              )}
            </section>
          )}
          <details className="fq-project-location">
            <summary>Project details</summary>
            <code>{project.root}</code>
            <p>Python · OpenQASM · read-only .fqx</p>
            {project.truncated && (
              <p role="status">
                File list limited. Open a smaller folder to run this project.
              </p>
            )}
            {project.errors?.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </details>
        </>
      ) : (
        <div className="fq-project-empty">
          <span className="fq-project-empty-symbol" aria-hidden="true">
            ‹ / ›
          </span>
          <h3>Your code, together.</h3>
          <p>
            Open a local project to edit files, work with Agent and run Python.
          </p>
          <button
            className="primary"
            onClick={() => {
              setMode("open");
              setOpening(true);
            }}
          >
            Open project
          </button>
          {!!workspace.registry.projects.length && (
            <section className="fq-project-recents">
              <small className="eyebrow">RECENT</small>
              {workspace.registry.projects.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  disabled={workspace.busy}
                  title={item.root}
                  onClick={() => void openProject(item.path)}
                >
                  {item.name}
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
