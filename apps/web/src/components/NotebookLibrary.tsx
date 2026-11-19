import { useEffect, useRef, useState } from "react";
import {
  matchingNotebooks,
  notebookRevision,
  notebookText,
  loadNotebook,
  type NotebookDocument,
  type NotebookExample,
} from "../state/notebooks";
import { AgentMarkdown } from "./AgentMarkdown";
import { CodeExample } from "./CodeExample";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { projectsAPI, type NotebookEnvironment } from "../api/projects";

const featured = [
  "community/basic_examples/superposition",
  "algorithms/search_and_optimization/qaoa/overview",
  "applications/chemistry/molecule_eigensolver/overview",
];
export function NotebookLibrary({
  query,
  onCreate,
}: {
  query: string;
  onCreate: (id: string, request: string) => Promise<boolean | undefined>;
}) {
  const matches = matchingNotebooks(query);
  const [selected, setSelected] = useState<NotebookExample>();
  const [document, setDocument] = useState<NotebookDocument>();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [environment, setEnvironment] = useState<NotebookEnvironment>();
  const [checking, setChecking] = useState(false);
  const checkRequest = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const invalidate = () => {
      checkRequest.current?.abort();
      setEnvironment(undefined);
      setChecking(false);
    };
    invalidate();
    window.addEventListener("fq-compute-environment-changed", invalidate);
    return () => {
      invalidate();
      window.removeEventListener("fq-compute-environment-changed", invalidate);
    };
  }, [selected]);
  const check = async () => {
    if (!selected || checking) return;
    const controller = new AbortController();
    checkRequest.current = controller;
    setChecking(true);
    setEnvironment(undefined);
    setError("");
    try {
      const value = await projectsAPI.checkNotebook(
        selected.id,
        controller.signal,
      );
      if (!controller.signal.aborted) setEnvironment(value);
    } catch (problem) {
      if (!controller.signal.aborted) setError(String(problem));
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  };
  const request = useRef(crypto.randomUUID().replaceAll("-", ""));
  const lock = useRef(false);
  useEffect(() => {
    setDocument(undefined);
    setError("");
    request.current = crypto.randomUUID().replaceAll("-", "");
    if (!selected) return;
    const controller = new AbortController();
    void loadNotebook(selected, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDocument(value);
      })
      .catch((problem) => {
        if (!controller.signal.aborted) setError(String(problem));
      });
    return () => controller.abort();
  }, [selected]);
  const create = async () => {
    if (!selected || lock.current) return;
    lock.current = true;
    setCreating(true);
    setError("");
    try {
      if (await onCreate(selected.id, request.current)) setSelected(undefined);
      else
        setError(
          "Could not create the project. Your existing drafts are retained; retry to resume this copy.",
        );
    } catch (problem) {
      setError(String(problem));
    } finally {
      lock.current = false;
      setCreating(false);
    }
  };
  const entry = (item: NotebookExample) => (
    <button
      className="fq-library-card"
      key={item.id}
      onClick={() => setSelected(item)}
    >
      <span className="fq-library-title">{item.title}</span>
      <small>{item.path.replaceAll("/", " / ")}</small>
      <span className="fq-example-open">Read notebook →</span>
    </button>
  );
  const folders = (items: NotebookExample[], depth = 0): React.ReactNode => {
    const names = [
      ...new Set(items.map((item) => item.path.split("/")[depth])),
    ];
    return names.map((name) => {
      const children = items.filter(
        (item) => item.path.split("/")[depth] === name,
      );
      if (children.length === 1) return entry(children[0]);
      return (
        <details key={name}>
          <summary>
            {name.replaceAll("_", " ")} <small>{children.length}</small>
          </summary>
          {folders(children, depth + 1)}
        </details>
      );
    });
  };
  return (
    <section className="fq-model-library-group" aria-label="Official notebooks">
      <details open={query.trim() ? true : undefined}>
        <summary>
          Official notebooks <small>{matches.length}</small>
        </summary>
        {!query.trim() &&
          matches.filter((item) => featured.includes(item.path)).map(entry)}
        {query.trim() ? matches.map(entry) : folders(matches)}
      </details>
      {selected && (
        <Modal
          className="fq-notebook-reader"
          label={selected.title}
          onClose={() => {
            if (!creating) setSelected(undefined);
          }}
        >
          <header>
            <div>
              <h2>{selected.title}</h2>
              <small>Official notebook · {notebookRevision.slice(0, 7)}</small>
            </div>
            <CloseButton
              label="Close notebook"
              onClick={() => {
                if (!creating) setSelected(undefined);
              }}
            />
          </header>
          <div className="fq-notebook-actions">
            <button
              className="primary"
              disabled={creating || !!selected.unavailableReason || !document}
              onClick={() => void create()}
            >
              {creating ? "Creating…" : "Create research copy"}
            </button>
            <a
              href={`/notebooks/${selected.id}.ipynb`}
              download="walkthrough.ipynb"
            >
              Download notebook
            </a>
            <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
              Official source ↗
            </a>
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="fq-notebook-pages">
            <div className="fq-notebook-environment">
              <button disabled={checking} onClick={() => void check()}>
                {checking ? "Checking environment…" : "Check environment"}
              </button>
              <span role="status" aria-label="Notebook environment status">
                {environment
                  ? {
                      ready: "Required imports and SDK APIs available",
                      sdk_incompatible: "SDK incompatible",
                      missing_dependencies: "Dependencies missing",
                      unavailable: "Environment check unavailable",
                    }[environment.status]
                  : "Current environment not checked"}
              </span>
              {environment && (
                <details open={environment.status !== "ready"}>
                  <summary>
                    {environment.status === "ready"
                      ? "Check details"
                      : "Prepare environment"}
                  </summary>
                  <p>
                    {environment.transport} · Python{" "}
                    {environment.runtime?.python || "unknown"} · SDK{" "}
                    {environment.runtime?.sdk_version || "unknown"} ·{" "}
                    {environment.timeout_seconds}s run limit
                  </p>
                  {environment.error && <p>{environment.error}</p>}
                  {[
                    ...(environment.incompatible_sdk || []),
                    ...(environment.missing_dependencies || []),
                  ].map((item) => (
                    <p key={item.name}>
                      <strong>{item.name}</strong>: {item.detail}
                    </p>
                  ))}
                  {environment.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                  {environment.status !== "ready" && (
                    <>
                      <p>{environment.preparation.guidance}</p>
                      <CodeExample
                        title="Run manually on the compute host"
                        code={environment.preparation.commands}
                        language="plain"
                      />
                      {!!environment.preparation.unmapped_imports.length && (
                        <p>
                          Check the workflow documentation for:{" "}
                          {environment.preparation.unmapped_imports.join(", ")}
                        </p>
                      )}
                    </>
                  )}
                </details>
              )}
            </div>
            <details className="fq-notebook-scope">
              <summary>Scope and environment</summary>
              <p>{selected.scope}</p>
              <p>Imports: {selected.imports.join(", ")}</p>
              <p>
                Upstream acceptance is historical evidence. Your selected
                environment is checked separately for this workflow. Creating a
                copy does not execute or install anything; review it, check the
                compute environment, then run Python explicitly.
              </p>
              <p>
                Runs use the existing 90-second limit. Longer workflows need a
                local SDK checkout. The saved circuit is the last observed
                execution; use the workflow output to identify the best
                candidate.
              </p>
              {selected.unavailableReason && (
                <p>{selected.unavailableReason}</p>
              )}
              <a href="/notebooks/NOTICE.txt" target="_blank" rel="noreferrer">
                Sources and licenses
              </a>
            </details>
            {!document && !error && <p role="status">Loading notebook…</p>}
            {document?.cells.map((cell, index) => (
              <section
                className="fq-notebook-cell"
                key={index}
                aria-label={`${cell.cell_type} cell ${index + 1}`}
              >
                {cell.cell_type === "markdown" ? (
                  <AgentMarkdown text={notebookText(cell.source)} />
                ) : cell.cell_type === "code" ? (
                  <CodeExample
                    title={`Python · ${index + 1}`}
                    code={notebookText(cell.source)}
                    language="python"
                  />
                ) : (
                  <pre>{notebookText(cell.source)}</pre>
                )}
                {!!cell.outputs?.length && (
                  <small>
                    Stored output omitted. Run the research copy to generate
                    current results.
                  </small>
                )}
              </section>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
