import {
  notebookContext,
  type NotebookContext,
} from "../state/notebook-context";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  notebookSessions,
  NotebookRequestError,
  type NotebookSession,
  type EditableCell,
  type CellOutput,
  type ExecuteCells,
} from "../api/notebook-sessions";
import {
  notebookHistory,
  splitCell,
  mergeCell,
} from "../state/notebook-editing";
import { NotebookCellEditor } from "./NotebookCellEditor";
import { AgentMarkdown } from "./AgentMarkdown";

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
        id: id.startsWith("import:") ? id.slice(7) : uuid(),
      }
    );
  } catch {
    return { id: id.startsWith("import:") ? id.slice(7) : uuid() };
  }
}
function Output({ output }: { output: CellOutput }) {
  if (output.output_type === "error")
    return (
      <pre className="fq-notebook-error">
        {String(output.ename || "Error")}: {String(output.evalue || "")}
        {"\n"}
        {(Array.isArray(output.traceback)
          ? output.traceback.join("\n")
          : ""
        ).replace(/\x1b\[[0-9;]*m/g, "")}
      </pre>
    );
  if (output.text)
    return (
      <pre>
        {Array.isArray(output.text)
          ? output.text.join("")
          : String(output.text)}
      </pre>
    );
  const data = output.data || {};
  return (
    <>
      {typeof data["image/png"] === "string" && (
        <img
          alt="Cell output"
          src={"data:image/png;base64," + data["image/png"]}
        />
      )}
      {typeof data["image/png"] !== "string" &&
        typeof data["image/jpeg"] === "string" && (
          <img
            alt="Cell output"
            src={"data:image/jpeg;base64," + data["image/jpeg"]}
          />
        )}
      {(typeof data["text/plain"] === "string" ||
        Array.isArray(data["text/plain"])) && (
        <pre>
          {Array.isArray(data["text/plain"])
            ? data["text/plain"].join("")
            : (data["text/plain"] as string)}
        </pre>
      )}
      {data["application/json"] !== undefined && (
        <pre>{JSON.stringify(data["application/json"], null, 2)}</pre>
      )}
    </>
  );
}

export function NotebookWorkspace({
  notebookId,
  onImport,
  onContextChange,
}: {
  notebookId: string;
  onContextChange?: (value: NotebookContext) => void;
  onImport: (id: string) => void;
}) {
  const [seed] = useState(() => initial(notebookId));
  const [session, setSession] = useState<NotebookSession>();
  const [history, edit] = useReducer(notebookHistory, {
    cells: seed.cells || [],
    past: [],
    future: [],
  });
  const cells = history.cells;
  const completionWords = useMemo(
    () => cells.map((cell) => cell.source).join("\n"),
    [cells],
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const cursors = useRef(new Map<string, number>());
  const [pending, setPending] = useState<ExecuteCells | undefined>(
    seed.pending,
  );
  const [editingMarkdown, setEditingMarkdown] = useState<string>();
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
        if (!seed.cells) edit({ type: "load", cells: value.cells });
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
  useEffect(() => {
    onContextChange?.(
      notebookContext(
        notebookId,
        session?.title || notebookId,
        cells,
        session,
        error,
      ),
    );
  }, [notebookId, cells, session, error, onContextChange]);
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
    if (!ids.length || active || pending) return;
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
  function update(next: EditableCell[], group?: string) {
    edit({ type: "edit", cells: next, group, time: Date.now() });
  }
  function insert(index: number, cell_type: EditableCell["cell_type"]) {
    const cell = { id: uuid(), cell_type, source: "" };
    update([...cells.slice(0, index), cell, ...cells.slice(index)]);
    if (cell_type === "markdown") setEditingMarkdown(cell.id);
  }
  async function importFile(file: File) {
    await act(async () => {
      if (file.size > 1024 * 1024)
        throw Error(
          "Import supports notebooks up to 1 MiB, 1000 cells and 32 KiB per cell.",
        );
      const text = await file.text();
      const notebook = JSON.parse(text);
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      );
      const id = Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      )
        .join("")
        .slice(0, 32);
      const value = await notebookSessions.import(id, file.name, notebook);
      onImport(value.notebook_id || "import:" + value.id);
    });
  }
  function download() {
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: session?.metadata || {
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
          ...(cell.notebook || {}),
          id: cell.notebook?.id || cell.id,
          cell_type: cell.cell_type,
          source: cell.source,
          metadata: cell.notebook?.metadata || {},
          ...(cell.cell_type === "code"
            ? {
                execution_count:
                  previous?.execution_count ??
                  cell.notebook?.execution_count ??
                  null,
                outputs: (
                  previous?.outputs ||
                  (cell.notebook?.outputs as CellOutput[]) ||
                  []
                ).map((output) => ({
                  ...output,
                  ...(output.data
                    ? {
                        metadata:
                          (output as CellOutput & { metadata?: unknown })
                            .metadata || {},
                      }
                    : {}),
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
    <section
      className="fq-notebook-reader fq-notebook-workspace fq-notebook-inline"
      aria-label="Notebook workspace"
      onKeyDown={(event) => {
        if (
          event.nativeEvent.isComposing ||
          !(event.ctrlKey || event.metaKey) ||
          event.altKey
        )
          return;
        if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          event.stopPropagation();
          edit({ type: event.shiftKey ? "redo" : "undo" });
        }
      }}
    >
      <div className="fq-notebook-topbar">
        <header>
          <div>
            <h2>{session?.title || "Notebook workspace"}</h2>
            <small>
              Editable research copy · Python kernel{" "}
              {session?.kernel || "connecting"}
            </small>
          </div>
        </header>
        <div className="fq-notebook-actions">
          <button
            disabled={!history.past.length}
            onClick={() => edit({ type: "undo" })}
            title="Undo edit (Ctrl/Cmd+Z)"
          >
            Undo
          </button>
          <button
            disabled={!history.future.length}
            onClick={() => edit({ type: "redo" })}
            title="Redo edit (Ctrl/Cmd+Shift+Z)"
          >
            Redo
          </button>
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
                setSession(
                  await notebookSessions.control(seed.id, "interrupt"),
                );
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
          <details className="fq-notebook-menu">
            <summary aria-label="Notebook file and shortcuts">More</summary>
            <div>
              <button onClick={download}>Download .ipynb</button>
              <button
                disabled={busy || active || !!pending}
                onClick={() => fileInput.current?.click()}
              >
                Import .ipynb
              </button>
              <p>
                Shift+Enter: run cell
                <br />
                Ctrl+Space: complete
                <br />
                Ctrl+Shift+Space: parameters
                <br />
                Ctrl/Cmd+Shift+−: split cell
                <br />
                Ctrl/Cmd+Z: undo edit
              </p>
              <small>
                Import creates an independent copy. Local support files are not
                included.
              </small>
            </div>
          </details>
          <input
            ref={fileInput}
            type="file"
            accept=".ipynb,application/x-ipynb+json"
            aria-label="Import notebook file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </div>
      </div>
      <p className="fq-notebook-hint" role="status">
        {session?.kernel === "stopped"
          ? "Kernel stopped · Run prerequisite cells to restore variables."
          : "Shared Python kernel · Shift+Enter to run · Markdown: double-click to edit."}{" "}
        Previous output is retained and marked when code changes.
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
              edit({ type: "load", cells: value.cells });
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
          const imported = cell.notebook?.outputs as CellOutput[] | undefined;
          const output = last?.outputs || imported || [];
          const changed = last
            ? last.source !== cell.source
            : !!imported?.length &&
              cell.source !==
                (Array.isArray(cell.notebook?.source)
                  ? cell.notebook.source.join("")
                  : cell.notebook?.source);
          return (
            <section
              className="fq-notebook-edit-cell"
              key={cell.id}
              data-cell-type={cell.cell_type}
              data-status={last?.status}
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
                    : !last && imported?.length
                      ? "Imported output · not verified here"
                      : last
                        ? `${last.status}${last.run.kernel_id !== session?.kernel_id ? " · previous kernel" : ""}`
                        : cell.cell_type === "code"
                          ? "Not run"
                          : ""}
                </span>
                {cell.cell_type === "code" && (
                  <button
                    aria-label={`Run cell ${index + 1}`}
                    title="Run cell (Shift+Enter)"
                    disabled={busy || active || !!pending || !session}
                    onClick={() => void run([cell.id])}
                  >
                    <span aria-hidden="true">▶</span>
                  </button>
                )}
                {cell.cell_type === "markdown" && (
                  <button
                    aria-label={`${editingMarkdown === cell.id ? "Render" : "Edit"} markdown cell ${index + 1}`}
                    onClick={() =>
                      setEditingMarkdown(
                        editingMarkdown === cell.id ? undefined : cell.id,
                      )
                    }
                  >
                    {editingMarkdown === cell.id ? "Done" : "Edit"}
                  </button>
                )}
                <details className="fq-notebook-menu">
                  <summary aria-label={`Cell ${index + 1} actions`}>⋯</summary>
                  <div
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button"))
                        event.currentTarget.parentElement?.removeAttribute(
                          "open",
                        );
                    }}
                  >
                    <button onClick={() => insert(index, "code")}>
                      Insert code above
                    </button>
                    <button onClick={() => insert(index + 1, "code")}>
                      Insert code below
                    </button>
                    <button onClick={() => insert(index + 1, "markdown")}>
                      Insert Markdown below
                    </button>
                    <button
                      onClick={() =>
                        update([
                          ...cells.slice(0, index + 1),
                          {
                            id: uuid(),
                            cell_type: cell.cell_type,
                            source: cell.source,
                          },
                          ...cells.slice(index + 1),
                        ])
                      }
                    >
                      Duplicate cell
                    </button>
                    <button
                      onClick={() =>
                        update(
                          splitCell(
                            cells,
                            cell.id,
                            cursors.current.get(cell.id) ?? cell.source.length,
                            uuid(),
                          ),
                        )
                      }
                    >
                      Split at cursor
                    </button>
                    <button
                      disabled={
                        index === cells.length - 1 ||
                        cells[index + 1].cell_type !== cell.cell_type
                      }
                      onClick={() => update(mergeCell(cells, index))}
                    >
                      Merge with next
                    </button>
                    <button
                      disabled={index === cells.length - 1 || active}
                      onClick={() => {
                        const copy = [...cells];
                        [copy[index], copy[index + 1]] = [
                          copy[index + 1],
                          copy[index],
                        ];
                        update(copy);
                      }}
                    >
                      Move down
                    </button>
                    <button
                      disabled={
                        busy ||
                        active ||
                        !!pending ||
                        !session ||
                        !cells
                          .slice(0, index + 1)
                          .some((c) => c.cell_type === "code")
                      }
                      onClick={() =>
                        void run(
                          cells
                            .slice(0, index + 1)
                            .filter((c) => c.cell_type === "code")
                            .map((c) => c.id),
                        )
                      }
                    >
                      Run through this cell
                    </button>
                    <button
                      disabled={
                        busy ||
                        active ||
                        !!pending ||
                        !session ||
                        !cells.slice(index).some((c) => c.cell_type === "code")
                      }
                      onClick={() =>
                        void run(
                          cells
                            .slice(index)
                            .filter((c) => c.cell_type === "code")
                            .map((c) => c.id),
                        )
                      }
                    >
                      Run from this cell
                    </button>
                  </div>
                </details>
                <button
                  title="Move cell up"
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
                  title="Delete cell"
                  aria-label={`Delete cell ${index + 1}`}
                  disabled={cells.length === 1 || active}
                  onClick={() => update(cells.filter((c) => c.id !== cell.id))}
                >
                  ×
                </button>
              </div>
              {cell.cell_type === "markdown" && editingMarkdown !== cell.id ? (
                <div
                  className="fq-notebook-markdown-preview"
                  tabIndex={0}
                  aria-label={`Markdown cell ${index + 1} preview`}
                  title="Double-click to edit Markdown"
                  onDoubleClick={() => setEditingMarkdown(cell.id)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setEditingMarkdown(cell.id);
                    }
                  }}
                >
                  <AgentMarkdown
                    text={
                      cell.source ||
                      "*Empty Markdown cell — select Edit to write.*"
                    }
                  />
                </div>
              ) : (
                <NotebookCellEditor
                  source={cell.source}
                  label={`Edit ${cell.cell_type} cell ${index + 1}`}
                  python={cell.cell_type === "code"}
                  onChange={(source) =>
                    update(
                      cells.map((value) =>
                        value.id === cell.id ? { ...value, source } : value,
                      ),
                      cell.id,
                    )
                  }
                  words={completionWords}
                  onAssist={(source, cursor, kind) =>
                    notebookSessions.assist(seed.id, source, cursor, kind)
                  }
                  onSelection={(at) => cursors.current.set(cell.id, at)}
                  onSplit={(at) =>
                    update(splitCell(cells, cell.id, at, uuid()))
                  }
                  onRun={() => {
                    if (cell.cell_type === "markdown")
                      setEditingMarkdown(undefined);
                    else if (!busy) void run([cell.id]);
                  }}
                />
              )}
              {(output.length > 0 || last?.run.error) && (
                <div
                  className="fq-notebook-cell-output"
                  aria-label={`Output cell ${index + 1}`}
                >
                  {output.map((output, i) => (
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
            onClick={() => {
              const id = uuid();
              update([...cells, { id, cell_type: "markdown", source: "" }]);
              setEditingMarkdown(id);
            }}
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
    </section>
  );
}
