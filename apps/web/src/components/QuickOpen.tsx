import { UIIcon } from "./UIIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectInfo } from "../state/project-workspace";
import { findProjectFiles } from "../state/workspace-continuity";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
export function QuickOpen({
  project,
  activePath,
  onOpen,
  onClose,
  onProject,
  error,
  workspaceBusy = false,
}: {
  project?: ProjectInfo;
  activePath?: string;
  onOpen: (path: string) => Promise<boolean | undefined>;
  onClose: () => void;
  onProject: () => void;
  error: string;
  workspaceBusy?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [attemptedPath, setAttemptedPath] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const matches = useMemo(
    () => findProjectFiles(project?.files || [], query, activePath),
    [project?.files, query, activePath],
  );
  const files = matches.slice(0, 40);
  const selected = Math.min(index, Math.max(0, files.length - 1));
  const open = async (path: string) => {
    if (lock.current || workspaceBusy) return;
    lock.current = true;
    setBusy(true);
    setAttemptedPath(path);
    try {
      const opened = await onOpen(path);
      if (alive.current) {
        if (opened) onClose();
        else input.current?.focus({ preventScroll: true });
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Modal
      layout="flush"
      className="fq-quick-open"
      label="Find project file"
      onClose={onClose}
      initialFocus={input}
    >
      <header>
        <span>
          Find file <small>{project?.name || "Local workspace"}</small>
        </span>
        <CloseButton label="Close file search" onClick={onClose} />
      </header>
      <input
        ref={input}
        role="combobox"
        aria-label="Find file"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="fq-file-matches"
        aria-describedby="fq-file-match-count"
        aria-activedescendant={
          files.length ? `fq-file-match-${selected}` : undefined
        }
        placeholder="Search by filename or path…"
        maxLength={128}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
          setAttemptedPath(null);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Home" || event.key === "End") {
            // Keep modified caret-navigation shortcuts available inside the query.
            if (
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey
            )
              return;
            event.preventDefault();
            setIndex(event.key === "Home" ? 0 : Math.max(0, files.length - 1));
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIndex(
              files.length
                ? (selected +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    files.length) %
                    files.length
                : 0,
            );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (!event.repeat && files[selected])
              void open(files[selected].path);
          }
        }}
      />
      <small id="fq-file-match-count" role="status" className="fq-quick-count">
        {matches.length > 40
          ? `Showing 40 of ${matches.length} matching files · Type more to narrow the list`
          : `${matches.length} matching ${matches.length === 1 ? "file" : "files"}`}
      </small>
      <div
        id="fq-file-matches"
        role="listbox"
        aria-label="Matching project files"
      >
        {files.map((file, position) => (
          <button
            id={`fq-file-match-${position}`}
            key={file.path}
            role="option"
            aria-selected={position === selected}
            tabIndex={-1}
            disabled={busy || workspaceBusy}
            onClick={() => void open(file.path)}
            ref={(element) => {
              if (element && position === selected)
                element.scrollIntoView({ block: "nearest" });
            }}
          >
            <span aria-hidden="true">
              <UIIcon
                name={file.kind === "artifact" ? "circuit" : "file"}
                size={14}
              />
            </span>
            <span>
              <b>{file.path.split("/").at(-1)}</b>
              <small>{file.path}</small>
            </span>
            <small>
              {file.kind === "artifact"
                ? "Experiment"
                : file.path.toLowerCase().endsWith(".py")
                  ? "Python"
                  : "OpenQASM"}
            </small>
          </button>
        ))}
      </div>
      {!project ? (
        <div className="fq-quick-empty">
          <p>Open a project to find and switch between its files.</p>
          <button onClick={onProject}>Open project</button>
        </div>
      ) : (
        !files.length && (
          <p className="fq-quick-empty">
            {query ? "No matching files." : "This project has no files yet."}
          </p>
        )
      )}
      {attemptedPath && error && !busy && !workspaceBusy && (
        <div className="fq-quick-error" role="alert">
          <strong>
            {activePath === attemptedPath
              ? "Could not refresh"
              : "Could not open"}{" "}
            {attemptedPath}
          </strong>
          <p>{error}</p>
          <button
            onClick={() => void open(attemptedPath)}
            aria-label={`Retry opening ${attemptedPath}`}
          >
            Retry opening
          </button>
        </div>
      )}
      <footer>
        <span>
          {busy
            ? "Opening…"
            : workspaceBusy
              ? "Waiting for current project operation…"
              : "↑ ↓ to select · Enter to open"}
        </span>
        <span>Esc to close</span>
      </footer>
    </Modal>
  );
}
