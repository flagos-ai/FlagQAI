import type { NotebookContext } from "../state/notebook-context";
import { NotebookWorkspace } from "../components/NotebookWorkspace";
import { NotebookPicker } from "../components/NotebookPicker";
import { notebookExamples } from "../state/notebooks";
import {
  detectedPythonStyle,
  pythonStyleLabels,
  pythonStyleOverride,
  validPythonStyle,
} from "../state/python-style";
import { reviewActionValid, type ReviewAction } from "../state/agent-review";
import { workspaceReducer } from "../state/reducer";
import { LivePythonPreview } from "../components/LivePythonPreview";
import type { AgentCodePreview } from "../state/agent-code-preview";
import { UIIcon } from "../components/UIIcon";
import { EditorFind } from "../components/EditorFind";
import { markCodeMatch, type CodeMatch } from "../state/editor-find";
import { CloseButton } from "../components/CloseButton";
import { useEditorPosition } from "../hooks/useEditorPosition";
import { workspaceShortcut } from "../state/workspace-continuity";
import { projectDirty } from "../state/project-workspace";
import { ProjectTabs } from "../components/ProjectTabs";
import type { ProjectWorkspace } from "../hooks/useProjectWorkspace";
import { pythonExample } from "../state/python-workspace";
import { indentSelection, isIndentShortcut } from "../state/editor-indent";
import {
  toggleLineComments,
  isCommentShortcut,
} from "../state/editor-comments";
import { changedLines } from "../state/code-diff";
import { PythonConsole } from "../components/PythonConsole";
import type { PythonWorkspace } from "../hooks/usePythonWorkspace";
import { codeTokens } from "../state/code-tokens";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import type { PythonRun } from "../api/python-runs";

import type { PlatformBridge } from "../hooks/usePlatformBridge";
import type { ResearchTurn } from "../state/research-record";
export function ModelPage({
  codePreview,
  notebookEditor,
  onNotebookEditorChange,
  onNotebookContextChange,
  state,
  dispatch,
  compile,
  editorSync,
  python,
  projectWorkspace,
  onOpenProject,
  onFindFile,
  onAttachSelection,
  onReferenceDocument,
  onRepairPython,
  backendLabel = "Configured CPU backend",
  research,
}: {
  notebookEditor: { active: boolean; id?: string };
  onNotebookContextChange: (value: NotebookContext) => void;
  onNotebookEditorChange: (value: { active: boolean; id?: string }) => void;
  projectWorkspace: ProjectWorkspace;
  onOpenProject: () => void;
  onFindFile: () => void;
  editorSync: EditorSync;
  python: PythonWorkspace;
  backendLabel?: string;
  research?: { turns: ResearchTurn[]; bridge: PlatformBridge };
  onRepairPython: (run: PythonRun) => Promise<void>;
  onReferenceDocument: () => void;
  onAttachSelection: (
    source: string,
    startLine: number,
    endLine: number,
  ) => void;
  state: WorkspaceState;
  codePreview?: AgentCodePreview;
  dispatch: React.Dispatch<WorkspaceAction>;
  compile: (source?: string, name?: string) => Promise<void>;
}) {
  const notebookId =
    (/^import:[a-f0-9]{32}$/.test(notebookEditor.id || "")
      ? notebookEditor.id
      : undefined) ||
    notebookExamples.find((item) => item.id === notebookEditor.id)?.id ||
    notebookExamples.find(
      (item) => item.path === "community/basic_examples/superposition",
    )!.id;
  const [reviewRequest, setReviewRequest] = useState<{
    id: string;
    sequence: number;
  }>();
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [findRequest, setFindRequest] = useState<{
    sequence: number;
    seed: string;
    anchor: number;
  } | null>(null);
  const [findMatch, setFindMatch] = useState<
    (CodeMatch & { source: string }) | null
  >(null);
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
    highlight = useRef<HTMLPreElement>(null),
    [scroll, setScroll] = useState({ top: 0, left: 0 }),
    [focus, setFocus] = useState(false),
    [configuration, setConfiguration] = useState(() => {
      try {
        return localStorage.getItem("fq-editor-configuration") === "open";
      } catch {
        return false;
      }
    });
  useEffect(() => {
    try {
      localStorage.setItem(
        "fq-editor-configuration",
        configuration ? "open" : "closed",
      );
    } catch {
      /* The panel remains usable without storage. */
    }
  }, [configuration]);
  const [errorsHeight, setErrorsHeight] = usePanelSize("errors", 180, 80, 500),
    [settingsWidth, setSettingsWidth] = usePanelSize("settings", 300, 230, 500),
    [constraintsHeight, setConstraintsHeight] = usePanelSize(
      "constraints",
      195,
      110,
      500,
    );
  const [compactOutput, setCompactOutput] = useState(() => {
    try {
      return localStorage.getItem("fq-python-output-compact-v1") === "on";
    } catch {
      return false;
    }
  });
  const changeOutputMode = (compact: boolean) => {
    setCompactOutput(compact);
    try {
      localStorage.setItem(
        "fq-python-output-compact-v1",
        compact ? "on" : "off",
      );
    } catch {
      /* Keep the current tab usable without storage. */
    }
  };
  const outputHeight =
    state.language === "python" && compactOutput ? 112 : errorsHeight;
  const capturePosition = useEditorPosition(
    state.editorLink?.id ||
      `${state.project?.id || "models"}:${state.language}:${state.name}`,
    editor,
    (view) => {
      setScroll({ top: view.top, left: view.left });
      setSelection({ start: view.start, end: view.end });
    },
  );
  const pendingEditView = useRef<{
    source: string;
    start: number;
    end: number;
    direction: "forward" | "backward" | "none";
    top: number;
    left: number;
  } | null>(null);
  useLayoutEffect(() => {
    const view = pendingEditView.current;
    pendingEditView.current = null;
    const textarea = editor.current;
    if (
      !view ||
      !textarea ||
      document.activeElement !== textarea ||
      textarea.value !== view.source
    )
      return;
    // Restore before another key event can observe React's end-of-value caret.
    textarea.setSelectionRange(view.start, view.end, view.direction);
    textarea.scrollTop = view.top;
    textarea.scrollLeft = view.left;
    capturePosition(textarea);
    setSelection({ start: view.start, end: view.end });
    setScroll({ top: textarea.scrollTop, left: textarea.scrollLeft });
  }, [state.source]);
  const isPython = state.language === "python";
  const detectedStyle = useMemo(
    () => (isPython ? detectedPythonStyle(state.source) : undefined),
    [isPython, state.source],
  );
  const needsProjectSave =
    !!state.editorLink?.project &&
    state.projectTabs?.some(
      (tab) =>
        tab.project.id === state.editorLink?.project?.id && projectDirty(tab),
    );
  const diagnostics = useMemo(
    () => (isPython ? [] : (lintOpenQASM(state.source) as Diagnostic[])),
    [state.source, isPython],
  );
  const errors = diagnostics.filter((d) => d.severity === "error"),
    lines = state.source.split("\n");
  const lineStarts = useMemo(() => {
    let offset = 0;
    return state.source.split("\n").map((line) => {
      const start = offset;
      offset += line.length + 1;
      return start;
    });
  }, [state.source]);
  const loadingRun =
    !!python.selectedRunId &&
    python.run?.id !== python.selectedRunId &&
    !python.error;
  const canRun = isPython
    ? !projectWorkspace.busy &&
      !python.submitting &&
      !loadingRun &&
      !["queued", "running"].includes(python.run?.status || "")
    : errors.length === 0 && !state.busy;
  const runCurrent = () => {
    if (!canRun || codePreview) return;
    if (isPython) void python.start(!!needsProjectSave);
    else compile();
  };
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
  const openFind = () => {
    const e = editor.current;
    const selected = e
      ? state.source.slice(e.selectionStart, e.selectionEnd)
      : "";
    setFindRequest((previous) => ({
      sequence: (previous?.sequence || 0) + 1,
      seed: selected.length <= 256 && !selected.includes("\n") ? selected : "",
      anchor: e?.selectionStart || 0,
    }));
  };
  const locate = (start: number, length: number, focusEditor = true) => {
    const e = editor.current;
    if (!e) return;
    start = Math.max(0, Math.min(state.source.length, start));
    const end = Math.min(state.source.length, start + Math.max(0, length));
    const before = state.source.slice(0, start);
    const line = before.split("\n").length;
    const column = start - (before.lastIndexOf("\n") + 1);
    const target = highlight.current?.querySelector<HTMLElement>(
      `[data-editor-line="${line}"]`,
    );
    const style = getComputedStyle(e);
    const lineHeight = parseFloat(style.lineHeight) || 22;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    let top = paddingTop + (line - 1) * lineHeight;
    let left = paddingLeft;
    if (target) {
      // Measure the rendered glyph at the source column, including tabs and Unicode.
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let offset = column;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (offset <= (node.textContent?.length || 0)) {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(
            node,
            Math.min(offset + 1, node.textContent?.length || 0),
          );
          const bounds = range.getBoundingClientRect();
          const viewport = e.getBoundingClientRect();
          if (bounds.height) {
            top = bounds.top - viewport.top + e.scrollTop;
            left = bounds.left - viewport.left + e.scrollLeft;
          }
          break;
        }
        offset -= node.textContent?.length || 0;
      }
    }
    if (focusEditor) e.focus({ preventScroll: true });
    e.setSelectionRange(start, end);
    e.scrollTop = Math.max(0, top - e.clientHeight / 2 + lineHeight / 2);
    e.scrollLeft = Math.max(0, left - paddingLeft - 32);
    capturePosition(e);
    setSelection({ start, end });
    setScroll({ top: e.scrollTop, left: e.scrollLeft });
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.isComposing) return;
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
          configuration && !focus && !notebookEditor.active
            ? `minmax(0,1fr) 6px ${settingsWidth}px`
            : "minmax(0,1fr)",
      }}
    >
      <section
        className="fq-model-center"
        data-notebook={notebookEditor.active}
      >
        <div className="fq-pane-title">
          <span className="fq-editor-mode-label">
            {notebookEditor.active ? "NOTEBOOK" : "MODEL EDITOR"}
          </span>
          {!notebookEditor.active && (
            <button
              className="fq-control-icon"
              aria-label="Find in code"
              title="Find in code (⌘F / Ctrl+F)"
              disabled={notebookEditor.active}
              onClick={openFind}
            >
              <UIIcon name="code" size={14} />
            </button>
          )}
          <button
            className="fq-project-open"
            aria-label="Open project workspace"
            onClick={onOpenProject}
          >
            Project{state.project ? " · " + state.project.name : ""}
          </button>
          <button
            className="fq-control-icon"
            aria-keyshortcuts="Meta+P Control+P"
            aria-label="Find file"
            title="Find file (⌘P / Ctrl+P)"
            onClick={onFindFile}
          >
            <UIIcon name="search" />
          </button>
          <div
            className="fq-language-tabs"
            role="group"
            aria-label="Source language"
          >
            <button
              disabled={!!state.activeProjectTab && !isPython}
              aria-pressed={!notebookEditor.active && isPython}
              onClick={() => {
                onNotebookEditorChange({ ...notebookEditor, active: false });
                dispatch({ type: "language", language: "python" });
              }}
            >
              Python
            </button>{" "}
            <button
              disabled={!!state.activeProjectTab && isPython}
              aria-pressed={!notebookEditor.active && !isPython}
              onClick={() => {
                onNotebookEditorChange({ ...notebookEditor, active: false });
                dispatch({ type: "language", language: "qasm" });
              }}
            >
              OpenQASM
            </button>
            <button
              aria-pressed={notebookEditor.active}
              onClick={() =>
                onNotebookEditorChange({ active: true, id: notebookId })
              }
            >
              Notebook
            </button>
          </div>
          {notebookEditor.active && (
            <NotebookPicker
              value={notebookId}
              onChange={(id) => onNotebookEditorChange({ active: true, id })}
            />
          )}
          {isPython && !notebookEditor.active && (
            <select
              className="fq-python-style"
              aria-label="Python authoring style"
              title="Code classification"
              value={pythonStyleOverride(state) || "auto"}
              onChange={(event) =>
                dispatch({
                  type: "python-style",
                  style: validPythonStyle(event.target.value),
                })
              }
            >
              <option value="auto">
                {detectedStyle
                  ? `Auto · ${pythonStyleLabels[detectedStyle]}`
                  : "Auto · Python"}
              </option>
              <option value="gates">{pythonStyleLabels.gates}</option>
              <option value="synthesis">{pythonStyleLabels.synthesis}</option>
            </select>
          )}
          {!notebookEditor.active && selection.end > selection.start && (
            <button
              className="fq-selection-action"
              onMouseDown={(event) => event.preventDefault()}
              onClick={sendSelection}
            >
              Send selection to Agent ↗
            </button>
          )}
          <button
            className="fq-control-icon"
            aria-pressed={focus}
            aria-label="Focus model editor"
            onClick={() => setFocus(!focus)}
          >
            <UIIcon name={focus ? "restore" : "expand"} />
          </button>
        </div>
        {notebookEditor.active && (
          <NotebookWorkspace
            key={notebookId}
            notebookId={notebookId}
            onContextChange={onNotebookContextChange}
            onReference={onReferenceDocument}
            onImport={(id) => onNotebookEditorChange({ active: true, id })}
          />
        )}
        <ProjectTabs
          state={state}
          dispatch={dispatch}
          onReview={(id) => {
            dispatch({ type: "project-tab", id });
            setReviewRequest((previous) => ({
              id,
              sequence: (previous?.sequence || 0) + 1,
            }));
          }}
        />
        <div className="fq-toolbar fq-model-toolbar" inert={!!codePreview}>
          <div className="fq-model-document">
            <span
              className="fq-filename"
              title={`${state.name}.${isPython ? "py" : "qasm"}`}
            >
              <UIIcon name="file" size={14} />
              <span>
                {state.name}.{isPython ? "py" : "qasm"}
              </span>
            </span>
            <EditorSyncBar
              state={state}
              dispatch={dispatch}
              sync={editorSync}
              reviewRequest={reviewRequest}
              runDisabled={isPython ? !canRun : state.busy}
              runLabel={isPython ? "Accept & run" : "Accept & compile"}
              onRunReview={async (action: ReviewAction) => {
                if (isPython) {
                  await python.startReviewed(action);
                  return;
                }
                if (!reviewActionValid(state, action))
                  throw Error("The review is stale. Refresh before compiling.");
                const snapshot = workspaceReducer(state, action);
                const problem = (
                  lintOpenQASM(snapshot.source) as Diagnostic[]
                ).find((d) => d.severity === "error");
                if (problem)
                  throw Error(
                    `Syntax error at line ${problem.line}, column ${problem.column}: ${problem.message}`,
                  );
                dispatch(action);
                await compile(snapshot.source, snapshot.name);
              }}
            />
          </div>
          <div
            className="fq-model-commands"
            role="toolbar"
            aria-label="Model commands"
          >
            <div className="fq-model-command-group">
              <button
                className="fq-control-icon"
                aria-label="Undo"
                title="Undo last edit"
                onClick={() => dispatch({ type: "undo" })}
                disabled={!state.undo.length}
              >
                <UIIcon name="undo" size={14} />
              </button>
              <button
                disabled={projectWorkspace.busy || python.submitting}
                title="Save current file (⌘S / Ctrl+S)"
                onClick={() => void projectWorkspace.save()}
              >
                <UIIcon name="save" size={14} /> Save
              </button>
              {state.project && needsProjectSave && (
                <button
                  disabled={projectWorkspace.busy || python.submitting}
                  onClick={() => void projectWorkspace.saveAll()}
                >
                  Save all
                </button>
              )}
              <button
                className="fq-control-icon"
                title="Download model"
                aria-label="Download model"
                onClick={() =>
                  download(
                    state.name + (isPython ? ".py" : ".qasm"),
                    state.source,
                  )
                }
              >
                <UIIcon name="download" />
              </button>
            </div>
            <div className="fq-model-command-group">
              <button
                className="fq-model-reference"
                aria-label="Reference in chat ↗"
                title="Reference in chat · Attach a snapshot to your next message without sending it"
                onClick={onReferenceDocument}
              >
                <UIIcon name="arrow" size={14} />
                <span className="fq-model-command-label">Reference</span>
              </button>
              <button
                aria-label="Configuration"
                title={
                  isPython ? "Python environment" : "Synthesis configuration"
                }
                aria-expanded={configuration}
                onClick={() => setConfiguration(!configuration)}
              >
                <UIIcon name="settings" size={14} />
                <span className="fq-model-command-label">
                  {isPython ? "Environment" : "Configuration"}
                </span>
              </button>
            </div>
            <button
              className="primary fq-run-primary"
              aria-label={
                isPython
                  ? needsProjectSave
                    ? "Save & run"
                    : "Run Python"
                  : "Compile"
              }
              disabled={!canRun}
              aria-keyshortcuts="Meta+Enter Control+Enter"
              title={
                needsProjectSave
                  ? "Save changed project files, then run this Python entry"
                  : "Run the current code"
              }
              onClick={runCurrent}
            >
              <UIIcon
                name={
                  !canRun &&
                  (python.submitting ||
                    loadingRun ||
                    ["queued", "running"].includes(python.run?.status || "") ||
                    state.busy)
                    ? "refresh"
                    : isPython
                      ? "play"
                      : "circuit"
                }
                className={
                  !canRun &&
                  (python.submitting ||
                    loadingRun ||
                    ["queued", "running"].includes(python.run?.status || "") ||
                    state.busy)
                    ? "fq-ui-busy"
                    : ""
                }
                size={14}
              />
              {isPython
                ? python.submitting
                  ? "Starting…"
                  : loadingRun
                    ? "Loading run…"
                    : python.run?.status === "queued"
                      ? "Queued…"
                      : python.run?.status === "running"
                        ? "Running…"
                        : needsProjectSave
                          ? "Save & run"
                          : "Run Python"
                : state.busy
                  ? "Compiling…"
                  : "Compile"}
            </button>
          </div>
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

        {projectWorkspace.error &&
          projectWorkspace.error !== editorSync.error && (
            <p className="fq-project-error" role="alert">
              {projectWorkspace.error}
            </p>
          )}
        {findRequest && (
          <EditorFind
            source={state.source}
            {...findRequest}
            onMatch={(source, match) =>
              setFindMatch(match ? { ...match, source } : null)
            }
            onReveal={(start, length) => locate(start, length, false)}
            onClose={() => {
              setFindRequest(null);
              setFindMatch(null);
              editor.current?.focus({ preventScroll: true });
            }}
          />
        )}
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
            ref={highlight}
            aria-hidden="true"
            className="fq-highlight"
            style={{
              transform: `translate(${-scroll.left}px,${-scroll.top}px)`,
            }}
          >
            {lines.map((text, i) => (
              <span
                data-editor-line={i + 1}
                key={(state.editorLink?.updated || 0) + ":" + i}
                className={[
                  errors.some((d) => d.line === i + 1) ? "code-error" : "",
                  agentLines.added.has(i + 1) ? "fq-agent-changed-line" : "",
                ].join(" ")}
              >
                {markCodeMatch(
                  codeTokens(text || " ", isPython ? "python" : "qasm"),
                  findMatch?.source === state.source
                    ? findMatch.start - lineStarts[i]
                    : -1,
                  findMatch?.source === state.source
                    ? findMatch.end - lineStarts[i]
                    : -1,
                ).map((token, j) => (
                  <span key={j} className={"fq-token-" + token.kind}>
                    {token.matched ? (
                      <mark className="fq-code-search-match">{token.text}</mark>
                    ) : (
                      token.text
                    )}
                  </span>
                ))}
                <br />
              </span>
            ))}
          </pre>
          <textarea
            ref={editor}
            inert={!!codePreview}
            aria-hidden={codePreview ? true : undefined}
            onSelect={(event) => {
              capturePosition(event.currentTarget);
              setSelection({
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              });
            }}
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
            aria-keyshortcuts="Meta+/ Control+/ Meta+Enter Control+Enter Meta+p Control+p Meta+f Control+f Meta+s Control+s"
            title="Toggle line comment: ⌘/ or Ctrl+/"
            spellCheck={false}
            onChange={(e) => {
              capturePosition(e.currentTarget);
              dispatch({ type: "edit", source: e.target.value });
            }}
            onBlur={(e) => capturePosition(e.currentTarget)}
            onKeyUp={(e) => capturePosition(e.currentTarget)}
            onScroll={(e) => {
              capturePosition(e.currentTarget);
              setScroll({
                top: e.currentTarget.scrollTop,
                left: e.currentTarget.scrollLeft,
              });
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Escape" &&
                findRequest &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                e.stopPropagation();
                setFindRequest(null);
                setFindMatch(null);
                return;
              }
              if (
                (e.metaKey || e.ctrlKey) &&
                !e.altKey &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.key.toLowerCase() === "f"
              ) {
                e.preventDefault();
                openFind();
                return;
              }
              const shortcut = workspaceShortcut({
                ...e,
                isComposing: e.nativeEvent.isComposing,
              });
              if (shortcut === "run") {
                e.preventDefault();
                if (!e.repeat) runCurrent();
                return;
              }
              if (shortcut === "save") {
                e.preventDefault();
                if (!e.repeat && !projectWorkspace.busy && !python.submitting)
                  void projectWorkspace.save();
                return;
              }
              const shortcutEvent = {
                ...e,
                isComposing: e.nativeEvent.isComposing,
              };
              const comment = isCommentShortcut(shortcutEvent);
              if (comment || isIndentShortcut(shortcutEvent)) {
                e.preventDefault();
                const textarea = e.currentTarget,
                  direction = textarea.selectionDirection,
                  top = textarea.scrollTop,
                  left = textarea.scrollLeft;
                const edit = comment
                  ? toggleLineComments(
                      state.source,
                      textarea.selectionStart,
                      textarea.selectionEnd,
                      isPython ? "python" : "qasm",
                    )
                  : indentSelection(
                      state.source,
                      textarea.selectionStart,
                      textarea.selectionEnd,
                      e.shiftKey,
                    );
                if (edit.source !== state.source) {
                  pendingEditView.current = { ...edit, direction, top, left };
                  dispatch({ type: "edit", source: edit.source });
                }
                return;
              }
              if (e.key === "Escape" && !e.nativeEvent.isComposing)
                setFocus(false);
            }}
          />
          {codePreview && (
            <LivePythonPreview key={codePreview.id} preview={codePreview} />
          )}
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
          <span>{isPython ? "Python · UTF-8" : "OpenQASM 2/3 · UTF-8"}</span>
        </div>
        {!focus && (
          <>
            <Separator
              label="Resize model errors panel"
              orientation="horizontal"
              reverse
              value={outputHeight}
              onChange={(height) => {
                changeOutputMode(false);
                setErrorsHeight(height);
              }}
              min={80}
              max={500}
              initial={180}
            />
            <section className="fq-errors" style={{ height: outputHeight }}>
              {isPython ? (
                <PythonConsole
                  compact={compactOutput}
                  onCompactChange={changeOutputMode}
                  python={python}
                  research={research}
                  state={state}
                  source={state.source}
                  dispatch={dispatch}
                  onLocate={(line) =>
                    locate(
                      lines.slice(0, line - 1).join("\n").length +
                        (line > 1 ? 1 : 0),
                      lines[line - 1]?.length || 1,
                    )
                  }
                  onRepair={onRepairPython}
                />
              ) : (
                <>
                  <div className="fq-pane-title">
                    <span className="fq-model-output-title">Diagnostics</span>{" "}
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
      {configuration && !focus && !notebookEditor.active && (
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
              <CloseButton
                label="Collapse configuration"
                title={
                  isPython ? "Hide environment panel" : "Hide configuration"
                }
                onClick={() => setConfiguration(false)}
              />
            </div>
            <section style={{ height: constraintsHeight, overflow: "auto" }}>
              <h3>{isPython ? "Execution" : "⌄ Constraints"}</h3>
              {isPython ? (
                <>
                  <p>
                    {state.editorLink?.project
                      ? "Frozen project snapshot in a temporary working directory"
                      : python.environment?.scope || "Single-file task"}
                  </p>
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
                    <span className="fq-readonly-value">16</span>
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
                  <span className="fq-readonly-value">
                    {python.environment?.python || "Configured Python"}
                  </span>
                </label>
                <label>
                  Python version
                  <span className="fq-readonly-value">
                    {python.run?.runtime?.python || "Detected when running"}
                  </span>
                </label>
                <p>Uses the packages installed in this Python environment.</p>
                <details className="fq-settings-help">
                  <summary>Save experiments</summary>
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
                    Saved .fqx experiments are retained.{" "}
                    {state.editorLink?.project
                      ? "Project sources stay on disk; runs use an isolated frozen copy."
                      : "Other working files are temporary and removed after each run."}
                  </p>
                </details>
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
                    <span className="fq-readonly-value">{value}</span>
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
                  <span className="fq-readonly-value">90 seconds</span>
                </label>
              </section>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
