import { useEffect, useRef, useState } from "react";
import {
  notebookSessions,
  NotebookRequestError,
  type NotebookSession,
  type EditableCell,
  type CellOutput,
  type ExecuteCells,
} from "../api/notebook-sessions";
import { AgentMarkdown } from "./AgentMarkdown";
import { CloseButton } from "./CloseButton";
import { Modal } from "./Modal";

const uuid = () => crypto.randomUUID().replaceAll("-", "");
const storageKey = (id: string) => "fq-notebook-workspace-v1:" + id;
function initial(id: string): {
  id: string;
  cells?: EditableCell[];
  pending?: ExecuteCells;
  revision?: string;
} {
  try {
    return (
      JSON.parse(localStorage.getItem(storageKey(id)) || "null") || {
        id: uuid(),
      }
    );
  } catch {
    return { id: uuid() };
  }
}
function Output({ output }: { output: CellOutput }) {
  if (output.output_type === "error")
    return (
      <pre className="fq-notebook-error">
        {output.ename}: {output.evalue}
        {"\n"}
        {output.traceback?.join("\n").replace(/\x1b\[[0-9;]*m/g, "")}
      </pre>
    );
  if (output.text) return <pre>{output.text}</pre>;
  const data = output.data || {};
  return (
    <>
      {typeof data["image/png"] === "string" && (
        <img
          alt="Cell output"
          src={"data:image/png;base64," + data["image/png"]}
        />
      )}
      {typeof data["image/jpeg"] === "string" && (
        <img
          alt="Cell output"
          src={"data:image/jpeg;base64," + data["image/jpeg"]}
        />
      )}
      {typeof data["text/plain"] === "string" && (
        <pre>{data["text/plain"]}</pre>
      )}
      {data["application/json"] !== undefined && (
        <pre>{JSON.stringify(data["application/json"], null, 2)}</pre>
      )}
    </>
  );
}

export function NotebookWorkspace({
  notebookId,
  onClose,
}: {
  notebookId: string;
  onClose: () => void;
}) {
  const [seed] = useState(() => initial(notebookId));
  const [session, setSession] = useState<NotebookSession>();
  const [cells, setCells] = useState<EditableCell[]>(seed.cells || []);
  const [pending, setPending] = useState<ExecuteCells | undefined>(
    seed.pending,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const baseRevision = useRef<string | undefined>(seed.revision);
  const [savedRevision, setSavedRevision] = useState(seed.revision);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(notebookId),
        JSON.stringify({
          id: seed.id,
          ...(cells.length ? { cells } : {}),
          pending,
          revision: savedRevision,
        }),
      );
      setStorageError("");
    } catch {
      setStorageError(
        "Browser draft storage is unavailable. Save or download your notebook before closing.",
      );
    }
  }, [cells, pending, savedRevision, seed.id, notebookId]);
  useEffect(() => {
    let live = true;
    void notebookSessions
      .open(notebookId, seed.id)
      .then((value) => {
        if (!live) return;
        setSession(value);
        baseRevision.current = seed.revision || value.revision;
        setSavedRevision(baseRevision.current);
        setError((previous) =>
          previous.startsWith("Disconnected.") ? "" : previous,
        );
        if (!seed.cells) setCells(value.cells);
        if (
          seed.pending &&
          value.runs.some((run) => run.id === seed.pending?.request_id)
        )
          setPending(undefined);
      })
      .catch((problem) => {
        if (live) setError(String(problem));
      });
    return () => {
      live = false;
    };
  }, [notebookId, seed]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const timer = window.setInterval(
      () => {
        void notebookSessions
          .read(seed.id)
          .then((value) => {
            if (!live) return;
            setSession(value);
            setError((previous) =>
              previous.startsWith("Disconnected.") ||
              (pending &&
                value.runs.some((run) => run.id === pending.request_id))
                ? ""
                : previous,
            );
            if (
              pending &&
              value.runs.some((run) => run.id === pending.request_id)
            )
              setPending(undefined);
          })
          .catch(() => {
            if (live)
              setError(
                "Disconnected. Saved cells and outputs are retained; reconnecting without executing cells.",
              );
          });
      },
      session.kernel === "busy" || pending ? 600 : 2500,
    );
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [session?.kernel, !!session, seed.id, pending]);
  const active = session?.kernel === "busy";
  async function save() {
    if (!session) throw Error("Notebook is not connected yet.");
    const value = await notebookSessions.save(
      seed.id,
      baseRevision.current || session.revision,
      cells,
    );
    setSession(value);
    baseRevision.current = value.revision;
    setSavedRevision(value.revision);
    return value;
  }
  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (problem) {
      setError(String(problem));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function run(ids: string[]) {
    if (active || pending) return;
    await act(async () => {
      const value = await save();
      const request = {
        request_id: uuid(),
        revision: value.revision,
        cell_ids: ids,
      };
      // Persist the send identity before dispatch so a lost receipt can be
      // reconciled after refresh without executing a second time.
      localStorage.setItem(
        storageKey(notebookId),
        JSON.stringify({
          id: seed.id,
          cells,
          pending: request,
          revision: value.revision,
        }),
      );
      setPending(request);
      try {
        const result = await notebookSessions.execute(seed.id, request);
        setSession(result);
        setPending(undefined);
      } catch (problem) {
        if (problem instanceof NotebookRequestError && problem.status < 500)
          setPending(undefined);
        throw problem;
      }
    });
  }
  function update(next: EditableCell[]) {
    setCells(next);
  }
  function download() {
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: {
          name: "python3",
          display_name: "Python 3",
          language: "python",
        },
      },
      cells: cells.map((cell) => {
        const previous = session?.runs
          .flatMap((run) => run.cells)
          .find((run) => run.id === cell.id && run.source === cell.source);
        return {
          ...cell,
          metadata: {},
          ...(cell.cell_type === "code"
            ? {
                execution_count: previous?.execution_count || null,
                outputs: (previous?.outputs || []).map((output) => ({
                  ...output,
                  ...(output.data ? { metadata: {} } : {}),
                })),
              }
            : {}),
        };
      }),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(notebook, null, 2)], {
        type: "application/x-ipynb+json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "research.ipynb";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Modal
      className="fq-notebook-reader fq-notebook-workspace"
      label="Notebook workspace"
      onClose={onClose}
    >
      <header>
        <div>
          <h2>{session?.title || "Notebook workspace"}</h2>
          <small>
            Editable research copy · Python kernel{" "}
            {session?.kernel || "connecting"}
          </small>
        </div>
        <CloseButton label="Close notebook workspace" onClick={onClose} />
      </header>
      <div className="fq-notebook-actions">
        <button
          className="primary"
          disabled={!session || busy || active || !!pending}
          onClick={() =>
            void run(
              cells.filter((c) => c.cell_type === "code").map((c) => c.id),
            )
          }
        >
          Run all
        </button>
        <button
          disabled={!session || busy || !!pending}
          onClick={() =>
            void act(async () => {
              await save();
            })
          }
        >
          Save notebook
        </button>
        <button
          disabled={!active || busy}
          onClick={() =>
            void act(async () => {
              setSession(await notebookSessions.control(seed.id, "interrupt"));
            })
          }
        >
          Interrupt
        </button>
        <button
          disabled={!session || active || busy || !!pending}
          onClick={() =>
            void act(async () => {
              setSession(await notebookSessions.control(seed.id, "restart"));
            })
          }
        >
          Restart kernel
        </button>
        <button onClick={download}>Download .ipynb</button>
      </div>
      <p className="fq-notebook-hint" role="status">
        {session?.kernel === "stopped"
          ? "Kernel stopped. Variables are not retained after restart; run prerequisite cells explicitly."
          : "Cells share variables in this kernel. Shift+Enter runs the selected code cell."}{" "}
        Output is retained; changed code is marked.
      </p>
      {storageError && <p role="alert">{storageError}</p>}
      {error && <p role="alert">{error}</p>}
      {error.includes("changed in another window") && (
        <button
          disabled={busy || !!pending}
          onClick={() =>
            void act(async () => {
              download();
              const value = await notebookSessions.read(seed.id);
              setSession(value);
              setCells(value.cells);
              baseRevision.current = value.revision;
              setSavedRevision(value.revision);
            })
          }
        >
          Download local draft and load saved cells
        </button>
      )}
      {pending && (
        <p role="alert">
          Execution receipt unconfirmed. Checking saved history before another
          run.{" "}
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                try {
                  setSession(await notebookSessions.execute(seed.id, pending));
                  setPending(undefined);
                } catch (problem) {
                  if (
                    problem instanceof NotebookRequestError &&
                    problem.status < 500
                  )
                    setPending(undefined);
                  throw problem;
                }
              })
            }
          >
            Retry same request
          </button>
        </p>
      )}
      <div className="fq-notebook-pages">
        {cells.map((cell, index) => {
          const last = session?.runs
            .flatMap((run) => run.cells.map((value) => ({ ...value, run })))
            .find((value) => value.id === cell.id);
          const changed = !!last && last.source !== cell.source;
          return (
            <section
              className="fq-notebook-edit-cell"
              key={cell.id}
              aria-label={`${cell.cell_type} cell ${index + 1}`}
            >
              <div className="fq-notebook-cell-toolbar">
                <span>
                  {cell.cell_type === "code"
                    ? `In [${last?.execution_count ?? " "}]`
                    : "Markdown"}
                </span>
                <span>
                  {changed
                    ? "Code changed · previous output"
                    : last
                      ? `${last.status}${last.run.kernel_id !== session?.kernel_id ? " · previous kernel" : ""}`
                      : cell.cell_type === "code"
                        ? "Not run"
                        : ""}
                </span>
                {cell.cell_type === "code" && (
                  <button
                    disabled={busy || active || !!pending || !session}
                    onClick={() => void run([cell.id])}
                  >
                    Run cell {index + 1}
                  </button>
                )}
                <button
                  aria-label={`Move cell ${index + 1} up`}
                  disabled={!index || active}
                  onClick={() => {
                    const copy = [...cells];
                    [copy[index - 1], copy[index]] = [
                      copy[index],
                      copy[index - 1],
                    ];
                    update(copy);
                  }}
                >
                  ↑
                </button>
                <button
                  aria-label={`Delete cell ${index + 1}`}
                  disabled={cells.length === 1 || active}
                  onClick={() => update(cells.filter((c) => c.id !== cell.id))}
                >
                  Delete
                </button>
              </div>
              <textarea
                aria-label={`Edit ${cell.cell_type} cell ${index + 1}`}
                spellCheck={false}
                value={cell.source}
                rows={Math.min(20, Math.max(3, cell.source.split("\n").length))}
                onChange={(event) =>
                  update(
                    cells.map((c) =>
                      c.id === cell.id
                        ? { ...c, source: event.target.value }
                        : c,
                    ),
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    event.shiftKey &&
                    cell.cell_type === "code"
                  ) {
                    event.preventDefault();
                    if (!busy) void run([cell.id]);
                  }
                }}
              />
              {cell.cell_type === "markdown" && (
                <AgentMarkdown text={cell.source} />
              )}
              {last && (
                <div
                  className="fq-notebook-cell-output"
                  aria-label={`Output cell ${index + 1}`}
                >
                  {last.outputs.map((output, i) => (
                    <Output key={i} output={output} />
                  ))}
                  {last?.run.error && <p role="alert">{last.run.error}</p>}
                </div>
              )}
            </section>
          );
        })}
        <div className="fq-notebook-actions">
          <button
            onClick={() =>
              update([...cells, { id: uuid(), cell_type: "code", source: "" }])
            }
          >
            + Code cell
          </button>
          <button
            onClick={() =>
              update([
                ...cells,
                { id: uuid(), cell_type: "markdown", source: "" },
              ])
            }
          >
            + Markdown cell
          </button>
        </div>
        {!!session?.runs.length && (
          <details>
            <summary>Execution history · {session.runs.length}</summary>
            {session.runs.map((run) => (
              <p key={run.id}>
                {run.status} · {run.cells.length} cells · revision{" "}
                {run.revision.slice(0, 8)}
                {run.error && ` · ${run.error}`}
              </p>
            ))}
          </details>
        )}
      </div>
    </Modal>
  );
}
