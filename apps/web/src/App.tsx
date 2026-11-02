import { ResearchPackages } from "./components/ResearchPackages";
import { ExecutionBackend } from "./components/ExecutionBackend";
import { WorkspaceBackupNotice } from "./components/WorkspaceBackupNotice";
import { WorkspaceBackups } from "./components/WorkspaceBackups";
import { JobsLibrary } from "./components/JobsLibrary";
import { UIIcon } from "./components/UIIcon";
import { QuickOpen } from "./components/QuickOpen";
import { workspaceShortcut } from "./state/workspace-continuity";
import { useProjectWorkspace } from "./hooks/useProjectWorkspace";
import { ProjectExplorer } from "./components/ProjectExplorer";
import { importExperiment } from "./api/experiments";
import { modelImportKind, readModelImport } from "./state/model-import";
import { usePythonWorkspace } from "./hooks/usePythonWorkspace";
import { usePlatformBridge } from "./hooks/usePlatformBridge";
import type { AgentAttachment } from "./state/agent-attachments";
import { useEditorSync } from "./hooks/useEditorSync";
import { useAgentConversation } from "./hooks/useAgentConversation";
import { Modal } from "./components/Modal";
import { CloseButton } from "./components/CloseButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icons";
import { ModelLibrary } from "./components/ModelLibrary";
import { AgentPanel } from "./components/AgentPanel";
import { Separator } from "./components/Separator";
import { ModelPage } from "./pages/ModelPage";
import { ProgramPage } from "./pages/ProgramPage";
import { ExecutionPage } from "./pages/ExecutionPage";
import { SynthesisPage } from "./pages/SynthesisPage";
import { JobsPage } from "./pages/JobsPage";
import { useQuantumWorkspace } from "./hooks/useQuantumWorkspace";
import { usePanelSize } from "./hooks/usePanelSize";
import type { Page } from "./contracts/quantum-workspace";
import { editorFiles } from "./api/editor-files";
import {
  pythonRepairRequest,
  type PythonRepairRequest,
} from "./state/python-failure";

import { researchTurnsFromProgress } from "./state/research-turns";
import { progressTurns } from "./state/agent-progress";
export default function App() {
  const agent = useAgentConversation();
  const [pendingAttachment, setPendingAttachment] = useState<AgentAttachment>();
  const [pendingRepair, setPendingRepair] = useState<PythonRepairRequest>();
  const {
      state,
      dispatch,
      compile,
      compilingSource,
      run,
      setActionContext,
      backendLabel,
      backend,
      backupStatus,
      retryBackup,
    } = useQuantumWorkspace(),
    [sidebarWidth, setSidebarWidth] = usePanelSize("sidebar", 280, 170, 480),
    [guide, setGuide] = useState(false),
    [uploadError, setUploadError] = useState("");
  const bridge = usePlatformBridge(state, dispatch, agent);
  const researchTurns = useMemo(
    () =>
      researchTurnsFromProgress(progressTurns(agent.view, []), bridge.actions),
    [agent.view, bridge.actions],
  );
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    setActionContext(
      bridge.ready && bridge.session
        ? { client: bridge.client, session: bridge.session }
        : undefined,
    );
  }, [bridge.ready, bridge.client, bridge.session]);
  const editorSync = useEditorSync(state, dispatch);
  const projectWorkspace = useProjectWorkspace(state, dispatch);
  const [projectRequest, setProjectRequest] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  useEffect(() => {
    const find = (event: KeyboardEvent) => {
      if (workspaceShortcut(event) !== "find") return;
      event.preventDefault();
      if (!event.repeat && !document.querySelector("dialog[open]"))
        setQuickOpen(true);
    };
    window.addEventListener("keydown", find);
    return () => window.removeEventListener("keydown", find);
  }, []);
  const python = usePythonWorkspace(state, dispatch, bridge);
  const programUpload = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const pages: [Page, string][] = [
    ["model", "MODEL"],
    ["synthesis", "SYNTHESIS"],
    ["program", "QUANTUM"],
    ["execution", "EXECUTION"],
    ["jobs", "JOBS"],
  ];
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dispatch({ type: "agent", open: false });
        setGuide(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [dispatch]);
  const upload = async (file: File, program = false) => {
    if (state.busy || importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setUploadError("");
    try {
      const kind = modelImportKind(file, program);
      if (kind === "experiment") {
        const record = await importExperiment(file);
        dispatch({ type: "import-experiment", record, open: true });
      } else {
        const model = await readModelImport(file);
        if (program) await compile(model.source, model.name);
        else
          dispatch({
            type: "model",
            model: { ...model, language: kind },
            preserveDraft: true,
          });
      }
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Cannot import this file.",
      );
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };
  const navigate = (page: Page) => {
    dispatch({ type: "navigate", page });
  };
  const sidebar = () => {
    if (state.agentOpen)
      return (
        <AgentPanel
          language={state.page === "program" ? "qasm" : state.language}
          agent={agent}
          bridge={bridge}
          jobs={state.jobs}
          pendingAttachment={pendingAttachment}
          pendingRepair={pendingRepair}
          onRepairConsumed={() => setPendingRepair(undefined)}
          onAttachmentConsumed={() => setPendingAttachment(undefined)}
          references={[
            ...(state.projectTabs || []).map((tab) => ({
              id: tab.id,
              name: tab.project.name + "/" + tab.path,
              source: tab.source,
              language: tab.language,
              workspaceFile: tab.editorLink.path,
              kind: "model" as const,
            })),
            ...state.models.map((model) => ({
              id: "model-" + (model.language || "qasm") + "-" + model.name,
              name:
                model.name + (model.language === "python" ? ".py" : ".qasm"),
              source: model.source,
              language: model.language,
              kind: "model" as const,
            })),
            ...state.programs.map((program) => ({
              id: "program-" + program.id,
              name: program.name + ".qasm",
              source: program.source,
              kind: "program" as const,
            })),
          ]}
          editorFile={
            state.editorLink &&
            (state.page !== "program" ||
              state.programs.find((p) => p.id === state.selectedProgramId)
                ?.source === state.source)
              ? state.editorLink.path
              : undefined
          }
          source={
            state.page === "program"
              ? state.programs.find(
                  (program) => program.id === state.selectedProgramId,
                )?.source || state.source
              : state.source
          }
          name={
            state.page === "program"
              ? state.programs.find(
                  (program) => program.id === state.selectedProgramId,
                )?.name || state.name
              : state.name
          }
          contextLabel={
            state.page === "program" ? "CURRENT PROGRAM" : "CURRENT MODEL"
          }
          onClose={() => dispatch({ type: "agent", open: false })}
        />
      );
    if (state.page === "model")
      return (
        <ModelLibrary
          projectRequest={projectRequest}
          projectPanel={
            <ProjectExplorer
              state={state}
              workspace={projectWorkspace}
              dispatch={dispatch}
            />
          }
          models={state.models}
          onSelect={(model) =>
            dispatch({ type: "model", model, preserveDraft: true })
          }
          onUpload={(file) => void upload(file)}
          busy={state.busy || importing}
          importing={importing}
        />
      );
    if (state.page === "program")
      return (
        <>
          <div className="fq-pane-title">
            QUANTUM PROGRAMS <small>{state.programs.length}</small>
          </div>
          <div className="fq-library-body fq-program-library">
            <div className="fq-program-library-tools">
              <button
                className="outline"
                disabled={state.busy || importing}
                onClick={() => programUpload.current?.click()}
              >
                <UIIcon name="upload" size={14} />
                {importing ? "Importing file…" : "Upload Quantum Program"}
              </button>
              <small>
                OpenQASM: up to 32 KiB · .fqx experiment: up to 16 MiB
              </small>
              <input
                ref={programUpload}
                hidden
                type="file"
                accept=".qasm,.txt,.fqx"
                onChange={(e) => {
                  if (e.target.files?.[0]) void upload(e.target.files[0], true);
                  e.target.value = "";
                }}
              />
            </div>
            {state.error && <p role="alert">{state.error.message}</p>}
            <ul className="fq-program-list" aria-label="Quantum programs">
              {state.programs.map((p) => (
                <li key={p.id}>
                  <button
                    aria-label={`Open quantum program ${p.name}`}
                    aria-current={
                      p.id === state.selectedProgramId ? "true" : undefined
                    }
                    title={`${p.name} · ${p.experiment?.filename || "Compiled program"} · ${new Date(p.created).toLocaleString()}`}
                    className={
                      "fq-library-card " +
                      (p.id === state.selectedProgramId ? "selected" : "")
                    }
                    onClick={() => dispatch({ type: "program", id: p.id })}
                  >
                    <span className="fq-program-row-title">
                      <UIIcon name="circuit" size={14} />
                      <strong>{p.name}</strong>
                      <time
                        title={new Date(p.created).toLocaleString()}
                        aria-label={`Created ${new Date(p.created).toLocaleString()}`}
                      >
                        {new Date(p.created).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </span>
                    <small className="fq-program-row-summary">
                      <span>
                        {p.compiled.qubits} qubits · depth {p.compiled.depth}
                      </span>
                      {p.experiment && (
                        <span>
                          ·{" "}
                          {p.experiment.has_result
                            ? "Saved result"
                            : "Circuit only"}
                        </span>
                      )}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            {!state.programs.length && (
              <p>Compiled programs will appear here.</p>
            )}
          </div>
          <footer>Up to 8 local snapshots</footer>
        </>
      );
    if (state.page === "jobs")
      return <JobsLibrary state={state} dispatch={dispatch} />;
    if (state.page === "synthesis")
      return (
        <>
          <div className="fq-pane-title">COMPILER</div>
          <div className="fq-library-body fq-compiler-sidebar">
            <h3>FlagQuantum</h3>
            <p>{backendLabel}</p>
            <details>
              <summary>Compiler details</summary>
              <p>
                OpenQASM 2/3 import and compilation through the installed
                FlagQuantum package.
              </p>
              <p>
                2 CPU threads per task · 1 active task + up to 3 waiting · 16
                qubits · 100,000 shots maximum · 90-second process limit.
              </p>
              <p>Credentials stay in the local environment.</p>
            </details>
          </div>
        </>
      );
    return <ExecutionBackend backend={backend} />;
  };
  return (
    <div className="fq-workspace fq-ui-controls">
      {quickOpen && (
        <QuickOpen
          project={state.project}
          activePath={state.editorLink?.project?.path}
          onOpen={projectWorkspace.openFile}
          workspaceBusy={projectWorkspace.busy}
          error={projectWorkspace.error}
          onClose={() => setQuickOpen(false)}
          onProject={() => {
            setQuickOpen(false);
            dispatch({ type: "navigate", page: "model" });
            dispatch({ type: "agent", open: false });
            setProjectRequest((value) => value + 1);
          }}
        />
      )}
      <header className="fq-header">
        <a
          href="#model"
          aria-label="FlagQuantum"
          onClick={() => navigate("model")}
        >
          <span className="fq-brand">FlagQuantum</span>
        </a>
        <button className="fq-header-guide" onClick={() => setGuide(true)}>
          User Guide ↗
        </button>
        <WorkspaceBackups state={state} dispatch={dispatch} />
        <ResearchPackages dispatch={dispatch} />
        <div className="fq-header-partners" aria-label="BAAI and FlagOS">
          <img
            className="fq-partner-baai"
            src="/assets/baai-logo-white.png"
            alt="BAAI 智源研究院"
            title="北京智源人工智能研究院"
            width="93"
            height="30"
          />
          <span className="fq-partner-divider" aria-hidden="true" />
          <img
            className="fq-partner-flagos"
            src="/assets/flagos-logo-white.svg"
            alt="FlagOS"
            title="FlagOS"
            width="80"
            height="24"
          />
        </div>
      </header>
      <div
        className="fq-app"
        style={{
          gridTemplateColumns: `92px ${sidebarWidth}px 6px minmax(0,1fr)`,
        }}
      >
        <nav className="fq-nav">
          <button
            aria-label="FlagQAI Agent"
            aria-expanded={state.agentOpen}
            className={state.agentOpen ? "active" : ""}
            onClick={() => dispatch({ type: "agent", open: !state.agentOpen })}
          >
            <span className="fq-agent-icon" />
            AGENT
          </button>
          {pages.map(([page, label]) => (
            <button
              key={page}
              className={state.page === page ? "active" : ""}
              onClick={() => navigate(page)}
            >
              <Icon name={page} />
              <span>{label}</span>
            </button>
          ))}
          <div className="push" />
          <button onClick={() => setGuide(true)}>
            <UIIcon name="book" size={26} />
            LEARN MORE
          </button>
          <button onClick={() => setGuide(true)}>
            <UIIcon name="workspace" size={26} />
            WORKSPACE
          </button>
        </nav>
        <aside className="fq-sidebar">{sidebar()}</aside>
        <Separator
          label="Resize left sidebar"
          value={sidebarWidth}
          onChange={setSidebarWidth}
          min={170}
          max={480}
          initial={280}
        />
        <main className="fq-main">
          <WorkspaceBackupNotice
            status={backupStatus}
            state={state}
            onRetry={retryBackup}
          />
          {uploadError && (
            <div className="fq-diagnostic error" role="alert">
              {uploadError}
              <CloseButton
                label="Dismiss import error"
                title="Dismiss import error"
                onClick={() => setUploadError("")}
              />
            </div>
          )}
          {state.page === "model" && (
            <ModelPage
              onFindFile={() => setQuickOpen(true)}
              projectWorkspace={projectWorkspace}
              onOpenProject={() => {
                setProjectRequest((value) => value + 1);
                dispatch({ type: "agent", open: false });
              }}
              python={python}
              research={{
                turns: researchTurns,
                bridge,
              }}
              editorSync={editorSync}
              backendLabel={backendLabel}
              onRepairPython={async (failed) => {
                const snapshot = state;
                if (failed.project) {
                  const project = failed.project;
                  const path = [
                    project.path === "." ? "" : project.path,
                    project.entry,
                  ]
                    .filter(Boolean)
                    .join("/");
                  setPendingRepair(
                    pythonRepairRequest(failed, {
                      id: "project:" + project.id + ":" + project.entry,
                      path,
                      source: failed.source,
                      revision: failed.source_hash || "",
                    }),
                  );
                  dispatch({ type: "agent", open: true });
                  return;
                }
                const file = await editorFiles.create(failed.source, "python");
                const request = pythonRepairRequest(failed, file);
                if (
                  latest.current.name !== snapshot.name ||
                  latest.current.language !== "python"
                )
                  throw Error(
                    "The active model changed. Open the failed Python run and try again.",
                  );
                dispatch({
                  type: "link-editor",
                  name: snapshot.name,
                  expectedSource: failed.source,
                  file,
                });
                setPendingRepair(request);
                dispatch({ type: "agent", open: true });
              }}
              onAttachSelection={(source, startLine, endLine) => {
                setPendingAttachment({
                  id: "selection-" + crypto.randomUUID(),
                  name: `${state.name}.${state.language === "python" ? "py" : "qasm"} · L${startLine}${endLine === startLine ? "" : "–" + endLine}`,
                  source,
                  language: state.language,
                  kind: "model",
                  workspaceFile: state.editorLink?.path,
                  selection: { startLine, endLine },
                });
                dispatch({ type: "agent", open: true });
              }}
              state={state}
              dispatch={dispatch}
              compile={compile}
            />
          )}
          {state.page === "program" && (
            <ProgramPage
              key={state.selectedProgramId}
              state={state}
              dispatch={dispatch}
              compile={() => void compile()}
            />
          )}
          {state.page === "execution" && (
            <ExecutionPage
              state={state}
              dispatch={dispatch}
              run={() => void run()}
            />
          )}
          {state.page === "jobs" && (
            <JobsPage state={state} dispatch={dispatch} />
          )}
          {state.page === "synthesis" && (
            <SynthesisPage
              state={state}
              dispatch={dispatch}
              compile={() => void compile()}
              compilingSource={compilingSource}
            />
          )}
        </main>
      </div>
      {guide && (
        <Modal
          className="fq-guide"
          label="FlagQuantum guide"
          onClose={() => setGuide(false)}
        >
          <header>
            <h2>From model to measurement.</h2>
            <CloseButton label="Close guide" onClick={() => setGuide(false)} />
          </header>
          <ol>
            <li>Edit or upload OpenQASM or Python in Model.</li>
            <li>Compile OpenQASM, or Run Python and publish its circuit.</li>
            <li>Set shots and seed, then run a CPU simulation.</li>
            <li>Inspect results and export JSON, CSV or a notebook.</li>
          </ol>
          <p>
            Computation uses the configured local adapter. Quantum hardware is
            not connected. FlagQAI Agent execution and permissions remain owned
            by the native Harness.
          </p>
          <button className="primary" onClick={() => setGuide(false)}>
            Start exploring →
          </button>
        </Modal>
      )}
    </div>
  );
}
