import { pythonExample } from "../state/python-workspace";
import {
  toggleLineComments,
  isCommentShortcut,
} from "../state/editor-comments";
import { changedLines } from "../state/code-diff";
import { SourceVersion } from "../components/SourceVersion";
import { PythonConsole } from "../components/PythonConsole";
import type { PythonWorkspace } from "../hooks/usePythonWorkspace";
import { codeTokens } from "../state/code-tokens";
import { useEffect, useMemo, useRef, useState } from "react";
import { lintOpenQASM } from "../../../../packages/quantum-workspace/domain/model-lint.mjs";
import { EditorSyncBar } from "../components/EditorSyncBar";
import type { EditorSync } from "../hooks/useEditorSync";
import { Separator } from "../components/Separator";
import { useStackedPanels } from "../hooks/useStackedPanels";
import { usePanelSize } from "../hooks/usePanelSize";
import type {
  WorkspaceAction,
  WorkspaceState,
  Diagnostic,
} from "../contracts/quantum-workspace";
import { download } from "../state/exports";

export function ModelPage({
  state,
  dispatch,
  compile,
  editorSync,
  python,
  onAttachSelection,
  backendLabel = "Configured CPU backend",
}: {
  editorSync: EditorSync;
  python: PythonWorkspace;
  backendLabel?: string;
  onAttachSelection: (
    source: string,
    startLine: number,
    endLine: number,
  ) => void;
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  compile: () => void;
}) {
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const sendSelection = () => {
    if (selection.end <= selection.start) return;
    onAttachSelection(
      state.source.slice(selection.start, selection.end),
      state.source.slice(0, selection.start).split("\n").length,
      state.source.slice(0, selection.end).replace(/\n$/, "").split("\n")
        .length,
    );
    setContextMenu(null);
  };
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [contextMenu]);
  const stacked = useStackedPanels();
  const editor = useRef<HTMLTextAreaElement>(null),
    [scroll, setScroll] = useState({ top: 0, left: 0 }),
    [focus, setFocus] = useState(false),
    [configuration, setConfiguration] = useState(true);
  const [errorsHeight, setErrorsHeight] = usePanelSize("errors", 180, 80, 500),
    [settingsWidth, setSettingsWidth] = usePanelSize("settings", 300, 230, 500),
    [constraintsHeight, setConstraintsHeight] = usePanelSize(
      "constraints",
      195,
      110,
      500,
    );
  const isPython = state.language === "python";
  const diagnostics = useMemo(
    () => (isPython ? [] : (lintOpenQASM(state.source) as Diagnostic[])),
    [state.source, isPython],
  );
  const errors = diagnostics.filter((d) => d.severity === "error"),
    lines = state.source.split("\n");
  const remoteError =
    state.error?.source === state.source ? state.error.message : null;
  const compiled = state.programs.find((p) => p.source === state.source);
  const agentLines = useMemo(() => {
    const change = state.editorLink?.change;
    return change &&
      state.source === change.after &&
      ["pending", "accepted"].includes(change.outcome)
      ? changedLines(change.before, change.after)
      : { added: new Set<number>(), removedAt: new Set<number>() };
  }, [state.source, state.editorLink?.change]);
  const locate = (start: number, length: number) => {
    const e = editor.current;
    if (!e) return;
    e.focus();
    e.setSelectionRange(start, start + length);
    e.scrollTop = Math.max(
      0,
      (state.source.slice(0, start).split("\n").length - 4) * 22,
    );
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  return (
    <div
      className={"fq-model-workspace " + (focus ? "focused" : "")}
      style={{
        gridTemplateColumns:
          configuration && !focus
            ? `minmax(0,1fr) 6px ${settingsWidth}px`
            : "minmax(0,1fr)",
      }}
    >
      <section className="fq-model-center">
        <div className="fq-pane-title">
          MODEL EDITOR
          <div
            className="fq-language-tabs"
            role="group"
            aria-label="Source language"
          >
            <button
              aria-pressed={isPython}
              onClick={() => dispatch({ type: "language", language: "python" })}
            >
              Python
            </button>{" "}
            <button
              aria-pressed={!isPython}
              onClick={() => dispatch({ type: "language", language: "qasm" })}
            >
              OpenQASM
            </button>
          </div>
          {selection.end > selection.start && (
            <button
              className="fq-selection-action"
              onMouseDown={(event) => event.preventDefault()}
              onClick={sendSelection}
            >
              Send selection to Agent ↗
            </button>
          )}
          <button
            aria-label="Focus model editor"
            onClick={() => setFocus(!focus)}
          >
            ⛶
          </button>
        </div>
        <div className="fq-toolbar">
          <span className="fq-filename">
            ◇ {state.name}.{isPython ? "py" : "qasm"}
          </span>
          <div className="push" />
          <button
            onClick={() => dispatch({ type: "undo" })}
            disabled={!state.undo.length}
          >
            ↶ Undo
          </button>
          <button onClick={() => dispatch({ type: "save" })}>Save</button>
          <button
            aria-label="Download model"
            onClick={() =>
              download(state.name + (isPython ? ".py" : ".qasm"), state.source)
            }
          >
            ↓
          </button>
          <button onClick={() => setConfiguration(!configuration)}>
            Configuration
          </button>
          <button
            className="primary"
            disabled={
              isPython
                ? python.submitting ||
                  ["queued", "running"].includes(python.run?.status || "")
                : errors.length > 0 || state.busy
            }
            onClick={isPython ? () => void python.start() : compile}
          >
            {isPython
              ? python.submitting
                ? "Starting…"
                : "Run Python ▷"
              : state.busy
                ? "Compiling…"
                : "Compile →"}
          </button>
        </div>
        {contextMenu && (
          <div
            className="fq-editor-context-menu"
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button role="menuitem" onClick={sendSelection}>
              Send selection to Agent
            </button>
          </div>
        )}
        <EditorSyncBar state={state} dispatch={dispatch} sync={editorSync} />
        <div className="fq-editor">
          <div
            className="fq-line-numbers"
            style={{ transform: `translateY(${-scroll.top}px)` }}
          >
            {lines.map((_, i) => (
              <div
                key={i}
                className={[
                  errors.some((d) => d.line === i + 1) ? "invalid" : "",
                  agentLines.added.has(i + 1) ? "fq-line-added" : "",
                  agentLines.removedAt.has(i + 1) ? "fq-line-removed" : "",
                ].join(" ")}
              >
                {i + 1}
              </div>
            ))}
          </div>
          <pre
            aria-hidden="true"
            className="fq-highlight"
            style={{
              transform: `translate(${-scroll.left}px,${-scroll.top}px)`,
            }}
          >
            {lines.map((text, i) => (
              <span
                key={(state.editorLink?.updated || 0) + ":" + i}
                className={[
                  errors.some((d) => d.line === i + 1) ? "code-error" : "",
                  agentLines.added.has(i + 1) ? "fq-agent-changed-line" : "",
                ].join(" ")}
              >
                {codeTokens(text || " ", isPython ? "python" : "qasm").map(
                  (token, j) => (
                    <span key={j} className={"fq-token-" + token.kind}>
                      {token.text}
                    </span>
                  ),
                )}
                <br />
              </span>
            ))}
          </pre>
          <textarea
            ref={editor}
            onSelect={(event) =>
              setSelection({
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              })
            }
            onContextMenu={(event) => {
              if (
                event.currentTarget.selectionEnd <=
                event.currentTarget.selectionStart
              )
                return;
              event.preventDefault();
              setSelection({
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              });
              setContextMenu({
                x: Math.min(event.clientX, window.innerWidth - 220),
                y: Math.min(event.clientY, window.innerHeight - 48),
              });
            }}
            value={state.source}
            aria-label="Quantum model code editor"
            aria-keyshortcuts="Meta+/ Control+/"
            title="Toggle line comment: ⌘/ or Ctrl+/"
            spellCheck={false}
            onChange={(e) => dispatch({ type: "edit", source: e.target.value })}
            onScroll={(e) =>
              setScroll({
                top: e.currentTarget.scrollTop,
                left: e.currentTarget.scrollLeft,
              })
            }
            onKeyDown={(e) => {
              if (
                isCommentShortcut({
                  ...e,
                  isComposing: e.nativeEvent.isComposing,
                })
              ) {
                e.preventDefault();
                const textarea = e.currentTarget,
                  direction = textarea.selectionDirection,
                  top = textarea.scrollTop,
                  left = textarea.scrollLeft;
                const edit = toggleLineComments(
                  state.source,
                  textarea.selectionStart,
                  textarea.selectionEnd,
                  isPython ? "python" : "qasm",
                );
                dispatch({ type: "edit", source: edit.source });
                requestAnimationFrame(() => {
                  if (
                    document.activeElement !== textarea ||
                    textarea.value !== edit.source
                  )
                    return;
                  textarea.setSelectionRange(edit.start, edit.end, direction);
                  textarea.scrollTop = top;
                  textarea.scrollLeft = left;
                });
                return;
              }
              if (e.key === "Escape") setFocus(false);
              if (e.key === "Tab") {
                e.preventDefault();
                const t = e.currentTarget,
                  start = t.selectionStart;
                dispatch({
                  type: "edit",
                  source:
                    state.source.slice(0, start) +
                    "    " +
                    state.source.slice(t.selectionEnd),
                });
                requestAnimationFrame(() =>
                  t.setSelectionRange(start + 4, start + 4),
                );
              }
            }}
          />
        </div>
        <div className="fq-editor-status">
          ●{" "}
          {isPython
            ? python.run?.source === state.source
              ? "Python · " + python.run.status
              : "Python · Ready to run"
            : errors.length
              ? `${errors.length} errors`
              : remoteError
                ? "Compilation failed"
                : compiled
                  ? "Compiled"
                  : "Local checks passed · Not compiled"}
          <span>
            {isPython ? "Python · UTF-8" : "OpenQASM 2/3 · UTF-8"}{" "}
            <SourceVersion source={state.source} compact />
          </span>
        </div>
        {!focus && (
          <>
            <Separator
              label="Resize model errors panel"
              orientation="horizontal"
              reverse
              value={errorsHeight}
              onChange={setErrorsHeight}
              min={80}
              max={500}
              initial={180}
            />
            <section className="fq-errors" style={{ height: errorsHeight }}>
              {isPython ? (
                <PythonConsole
                  python={python}
                  source={state.source}
                  dispatch={dispatch}
                  onLocate={(line) =>
                    locate(
                      lines.slice(0, line - 1).join("\n").length +
                        (line > 1 ? 1 : 0),
                      lines[line - 1]?.length || 1,
                    )
                  }
                />
              ) : (
                <>
                  <div className="fq-pane-title">
                    MODEL ERRORS{" "}
                    <span>
                      {errors.length ? `${errors.length} errors` : ""}
                    </span>
                  </div>
                  <div className="fq-error-list" role="status">
                    {diagnostics.map((d, i) => (
                      <button
                        className={"fq-diagnostic " + d.severity}
                        key={i}
                        onClick={() => locate(d.start, d.length)}
                      >
                        <b>{d.message}</b>
                        <small>
                          Line {d.line}, Column {d.column} · Local {d.severity}
                        </small>
                      </button>
                    ))}
                    {remoteError && (
                      <div className="fq-diagnostic error">
                        <b>Compilation failed</b>
                        <pre>{remoteError}</pre>
                        {/line\D*(\d+)/i.test(remoteError) && (
                          <button
                            onClick={() => {
                              const line = Number(
                                remoteError.match(/line\D*(\d+)/i)![1],
                              );
                              locate(
                                lines.slice(0, line - 1).join("\n").length +
                                  (line > 1 ? 1 : 0),
                                lines[line - 1]?.length || 1,
                              );
                            }}
                          >
                            Go to source line ↗
                          </button>
                        )}
                      </div>
                    )}
                    {!diagnostics.length && !remoteError && (
                      <div className="fq-diagnostic">
                        <b>
                          {state.busy
                            ? "Compiling on remote CPU…"
                            : compiled
                              ? "No errors found"
                              : "No local errors found"}
                        </b>
                        <p>
                          {compiled
                            ? `${compiled.compiled.qubits} qubits · depth ${compiled.compiled.depth}`
                            : "Local checks passed. Compile to validate full backend support."}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </section>
      {configuration && !focus && (
        <>
          <Separator
            label="Resize synthesis configuration"
            reverse
            orientation={stacked ? "horizontal" : "vertical"}
            value={settingsWidth}
            onChange={setSettingsWidth}
            min={230}
            max={500}
            initial={300}
          />
          <aside
            className="fq-settings"
            style={stacked ? { height: settingsWidth } : undefined}
          >
            <div className="fq-pane-title">
              {isPython ? "PYTHON ENVIRONMENT" : "SYNTHESIS CONFIGURATION"}
              <button
                aria-label="Collapse configuration"
                onClick={() => setConfiguration(false)}
              >
                ×
              </button>
            </div>
            <section style={{ height: constraintsHeight, overflow: "auto" }}>
              <h3>{isPython ? "Execution" : "⌄ Constraints"}</h3>
              {isPython ? (
                <>
                  <p>{python.environment?.scope || "Single-file task"}</p>
                  <p>
                    Backend:{" "}
                    {python.environment?.transport || "Configured environment"}
                  </p>
                  <p>90-second limit · stdout / stderr</p>
                </>
              ) : (
                <>
                  <label>
                    Max Width (qubits)
                    <input readOnly value="16" />
                  </label>
                  <p>Current CPU backend limit.</p>
                </>
              )}
            </section>
            <Separator
              label="Resize constraints and preferences"
              orientation="horizontal"
              value={constraintsHeight}
              onChange={setConstraintsHeight}
              min={110}
              max={500}
              initial={195}
            />
            {isPython ? (
              <section className="fq-preferences">
                <h3>Runtime</h3>
                <label>
                  Interpreter
                  <input
                    readOnly
                    value={python.environment?.python || "Configured Python"}
                  />
                </label>
                <label>
                  Python version
                  <input
                    readOnly
                    value={
                      python.run?.runtime?.python || "Detected when running"
                    }
                  />
                </label>
                <p>Uses the packages installed in this Python environment.</p>
                <h3>Save experiments</h3>
                <button
                  onClick={() =>
                    dispatch({
                      type: "model",
                      model: {
                        name: "Python Bell experiment",
                        source: pythonExample,
                        language: "python",
                      },
                      preserveDraft: true,
                    })
                  }
                >
                  Load save/load example
                </button>
                <p>
                  <code>fq.save("bell.fqx", result.plan, result=result)</code>
                </p>

                <p>
                  Saves the actual circuit and returned measurements. Relative
                  .fqx files are automatically collected from this run. Set
                  shots, seed and device in your Python code.
                </p>
                <p>
                  Saved .fqx experiments are retained. Other working files are
                  temporary and removed after each run.
                </p>
              </section>
            ) : (
              <section className="fq-preferences">
                <h3>⌄ Preferences</h3>
                {[
                  ["Backend service provider", "FlagQuantum"],
                  [
                    "Backend name",
                    isPython
                      ? python.environment?.python || "Python"
                      : backendLabel,
                  ],
                  ["Source format", isPython ? "Python" : "OpenQASM 2 / 3"],
                  ["Optimization", "FlagQuantum default"],
                ].map(([name, value]) => (
                  <label key={name}>
                    {name}
                    <input value={value} readOnly />
                  </label>
                ))}
                <label>
                  Default shots
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={state.shots}
                    onChange={(e) =>
                      dispatch({
                        type: "preferences",
                        shots: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Random seed
                  <input
                    type="number"
                    min={0}
                    max={2147483647}
                    value={state.seed}
                    onChange={(e) =>
                      dispatch({
                        type: "preferences",
                        seed: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Remote process timeout
                  <input value="90 seconds" readOnly />
                </label>
              </section>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
