import { useEffect, useMemo, useRef, useState } from "react";
import {
  sourceTree,
  loadSynthesisFile,
  synthesisFileModel,
  synthesisFilesRevision,
  type SynthesisFile,
  type SourceFolder,
} from "../state/synthesis-files";
import type { Model } from "../contracts/quantum-workspace";
import { notebookSessions } from "../api/notebook-sessions";
import { UIIcon } from "./UIIcon";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { AgentMarkdown } from "./AgentMarkdown";

export function SynthesisFileTree({
  query,
  onSelect,
  onOpenNotebook,
}: {
  query: string;
  onSelect: (model: Model) => void;
  onOpenNotebook: (id: string) => void;
}) {
  const tree = useMemo(() => sourceTree(query), [query]);
  const [expanded, setExpanded] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("fq-synthesis-files-expanded-v1") || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((value) => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    file: SynthesisFile;
    text?: string;
  }>();
  const current = useRef<AbortController | undefined>(undefined);
  const notebookRequests = useRef(new Map<string, string>());
  useEffect(() => () => current.current?.abort(), []);
  const toggle = (path: string) => {
    const next = expanded.includes(path)
      ? expanded.filter((value) => value !== path)
      : [...expanded, path];
    setExpanded(next);
    try {
      localStorage.setItem(
        "fq-synthesis-files-expanded-v1",
        JSON.stringify(next),
      );
    } catch {
      /* Navigation remains available. */
    }
  };
  const open = async (file: SynthesisFile) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setLoading(file.path);
    setError("");
    try {
      if (file.notebookId) {
        // A source-bound session preserves older saved notebooks and local drafts.
        const key = `fq-synthesis-notebook-v1:${file.path}:${file.sha256}`;
        let request = notebookRequests.current.get(key);
        if (!request) {
          try {
            request = localStorage.getItem(key) || undefined;
          } catch {
            /* Use the in-memory receipt. */
          }
          if (!request || !/^[a-f0-9]{32}$/.test(request))
            request = crypto.randomUUID().replaceAll("-", "");
          notebookRequests.current.set(key, request);
          try {
            localStorage.setItem(key, request);
          } catch {
            /* Same-tab retries retain the receipt. */
          }
        }
        const copy = await notebookSessions.open(file.notebookId, request);
        if (!controller.signal.aborted) onOpenNotebook("import:" + copy.id);
      } else if (file.path.endsWith(".png")) {
        setPreview({ file });
      } else {
        const source = await loadSynthesisFile(file, controller.signal);
        if (controller.signal.aborted) return;
        if (file.path.endsWith(".py"))
          onSelect(synthesisFileModel(file, source));
        else setPreview({ file, text: source });
      }
      if (!controller.signal.aborted) setSelected(file.path);
    } catch (problem) {
      if (!controller.signal.aborted) setError(String(problem));
    } finally {
      if (!controller.signal.aborted) setLoading("");
    }
  };
  const render = (node: SourceFolder): React.ReactNode => (
    <>
      {node.folders.map((folder) => {
        const visible = !!query.trim() || expanded.includes(folder.path);
        return (
          <div className="fq-source-folder" key={folder.path}>
            <button
              className="fq-source-row fq-source-folder-toggle"
              aria-expanded={visible}
              title={folder.path}
              onClick={() => toggle(folder.path)}
            >
              <UIIcon
                name="chevron"
                size={12}
                className={visible ? "expanded" : ""}
              />
              <UIIcon name="folder" size={14} />
              <span>{folder.name}</span>
            </button>
            {visible && (
              <div className="fq-source-children">{render(folder)}</div>
            )}
          </div>
        );
      })}
      {node.files.map((file) => (
        <button
          key={file.path}
          className="fq-source-row fq-source-file"
          title={file.path}
          aria-label={file.path}
          aria-current={selected === file.path ? "true" : undefined}
          aria-busy={loading === file.path}
          onClick={() => void open(file)}
        >
          <UIIcon
            name={
              file.notebookId
                ? "book"
                : file.path.endsWith(".py")
                  ? "code"
                  : "file"
            }
            size={14}
          />
          <span>{file.path.split("/").at(-1)}</span>
        </button>
      ))}
    </>
  );
  return (
    <section
      className="fq-source-library"
      aria-label="FlagQuantum synthesis files"
    >
      <div className="fq-source-heading">
        <strong>synthesis</strong>
        <small title={synthesisFilesRevision}>
          {synthesisFilesRevision.slice(0, 7)}
        </small>
      </div>
      {loading && (
        <small role="status">Opening {loading.split("/").at(-1)}…</small>
      )}
      {error && <p role="alert">{error}</p>}
      {!tree.folders.length && !tree.files.length && (
        <p role="status">No matching files.</p>
      )}
      {render(tree)}
      {preview && (
        <Modal
          className="fq-source-preview"
          label={preview.file.path}
          onClose={() => setPreview(undefined)}
        >
          <header>
            <h2>{preview.file.path}</h2>
            <CloseButton
              label="Close file"
              onClick={() => setPreview(undefined)}
            />
          </header>
          {preview.file.path.endsWith(".png") ? (
            <img src={preview.file.url} alt={preview.file.path} />
          ) : preview.file.path.endsWith(".md") ? (
            <AgentMarkdown text={preview.text || ""} />
          ) : (
            <pre>{preview.text}</pre>
          )}
          <a
            href={preview.file.url}
            download={preview.file.path.split("/").at(-1)}
          >
            Download original file
          </a>
        </Modal>
      )}
    </section>
  );
}
