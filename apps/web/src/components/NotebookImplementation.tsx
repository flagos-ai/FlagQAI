import { useEffect, useState } from "react";
import { notebookExamples, notebookRevision } from "../state/notebooks";
import {
  importedSources,
  implementationRole,
  loadImplementation,
  type NotebookImplementation as Implementation,
} from "../state/notebook-implementation";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { CodeExample } from "./CodeExample";

/** A read-only view of the exact companion modules, separate from editable cells. */
export function NotebookImplementation({
  notebookId,
  source,
}: {
  notebookId: string;
  source?: string;
}) {
  const item = notebookExamples.find((entry) => entry.id === notebookId);
  const [open, setOpen] = useState(false);
  const [implementation, setImplementation] = useState<Implementation>();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setImplementation(undefined);
    setError("");
    if (!open || !item) return;
    const controller = new AbortController();
    void loadImplementation(item, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setImplementation(value);
        const imported = importedSources(source || "", value.files);
        const local = `examples/synthesis/${item.path}/`;
        const paths = Object.keys(value.calls);
        setSelected(
          imported[0] ||
            paths.find((path) => path === local + "quantum.py") ||
            paths.find((path) => path.startsWith(local)) ||
            paths[0] ||
            "",
        );
      })
      .catch((problem) => {
        if (!controller.signal.aborted) setError(String(problem));
      });
    return () => controller.abort();
  }, [open, item, source]);
  if (
    !item ||
    (source !== undefined &&
      !/^\s*(?:from|import)\s+examples[.\w]*/m.test(source))
  )
    return null;
  const local = `examples/synthesis/${item.path}/`;
  const paths = Object.keys(implementation?.calls || {}).sort(
    (a, b) =>
      Number(b.startsWith(local)) - Number(a.startsWith(local)) ||
      a.localeCompare(b),
  );
  const referenced = implementation
    ? importedSources(source || "", implementation.files)
    : [];
  return (
    <>
      <button
        className="fq-notebook-implementation-link"
        onClick={() => setOpen(true)}
      >
        {source === undefined
          ? "How this notebook uses FlagQuantum"
          : "Read imported implementation"}
      </button>
      {open && (
        <Modal
          className="fq-notebook-implementation"
          label="FlagQuantum implementation"
          onClose={() => setOpen(false)}
        >
          <header>
            <div>
              <h2>FlagQuantum implementation</h2>
              <small>
                {item.title} · Pinned source {notebookRevision.slice(0, 7)}
              </small>
            </div>
            <CloseButton
              label="Close implementation"
              onClick={() => setOpen(false)}
            />
          </header>
          <p>
            Notebook cells call these companion modules. Follow the problem
            definition, quantum construction, execution and evaluation in the
            actual source. This read-only reference does not replace your edited
            cells or describe their current execution.
          </p>
          {error && <p role="alert">{error}</p>}
          {!implementation && !error && (
            <p role="status">Loading verified companion sources…</p>
          )}
          {implementation && (
            <div className="fq-notebook-implementation-layout">
              <nav aria-label="Companion source files">
                {paths.map((path) => (
                  <button
                    key={path}
                    aria-pressed={selected === path}
                    onClick={() => setSelected(path)}
                  >
                    <strong>
                      {path.startsWith(local)
                        ? path.slice(local.length)
                        : path.replace("examples/synthesis/", "")}
                    </strong>
                    <small>
                      {implementationRole(path)}
                      {referenced.includes(path)
                        ? " · Imported by this cell"
                        : ""}
                      {!path.startsWith(local) ? " · Shared helper" : ""}
                    </small>
                  </button>
                ))}
              </nav>
              <section aria-label="Selected implementation">
                <p className="fq-notebook-source-path">{selected}</p>
                <div className="fq-notebook-sdk-references">
                  <strong>Direct SDK calls</strong>
                  {(implementation.calls[selected] || []).length ? (
                    [
                      ...new Set(
                        implementation.calls[selected].map((call) => call.api),
                      ),
                    ].map((api) => (
                      <code key={api}>
                        {api} · L
                        {implementation.calls[selected]
                          .filter((call) => call.api === api)
                          .map((call) => call.line)
                          .join(", ")}
                      </code>
                    ))
                  ) : (
                    <span>
                      No direct FlagQuantum call in this module. Follow its
                      imports and helper calls.
                    </span>
                  )}
                </div>
                <p className="fq-notebook-hint">
                  Source references identify direct calls only; they do not
                  establish runtime coverage, validation or quantum advantage.
                </p>
                <CodeExample
                  title={selected.split("/").at(-1) || "Python source"}
                  language="python"
                  code={implementation.files[selected] || ""}
                />
              </section>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
