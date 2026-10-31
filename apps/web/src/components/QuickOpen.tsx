import { useMemo, useRef, useState } from "react";
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
}: {
  project?: ProjectInfo;
  activePath?: string;
  onOpen: (path: string) => Promise<boolean | undefined>;
  onClose: () => void;
  onProject: () => void;
  error: string;
}) {
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  const files = useMemo(
    () =>
      findProjectFiles(project?.files || [], query, activePath).slice(0, 40),
    [project?.files, query, activePath],
  );
  const selected = Math.min(index, Math.max(0, files.length - 1));
  const open = async (path: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setAttempted(true);
    try {
      if (await onOpen(path)) onClose();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
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
        aria-activedescendant={
          files.length ? `fq-file-match-${selected}` : undefined
        }
        placeholder="Search by filename or path…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
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
            disabled={busy}
            onClick={() => void open(file.path)}
            ref={(element) => {
              if (element && position === selected)
                element.scrollIntoView({ block: "nearest" });
            }}
          >
            <span aria-hidden="true">
              {file.kind === "artifact" ? "◇" : "‹›"}
            </span>
            <span>
              <b>{file.path.split("/").at(-1)}</b>
              <small>{file.path}</small>
            </span>
            <small>
              {file.kind === "artifact"
                ? "Experiment"
                : file.path.endsWith(".py")
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
      {attempted && error && <p role="alert">{error}</p>}
      <footer>
        <span>{busy ? "Opening…" : "↑ ↓ to select · Enter to open"}</span>
        <span>Esc to close</span>
      </footer>
    </Modal>
  );
}
