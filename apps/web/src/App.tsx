import { UIIcon } from "./components/UIIcon";
import { QuickOpen } from "./components/QuickOpen";
import { workspaceShortcut } from "./state/workspace-continuity";
import { useProjectWorkspace } from "./hooks/useProjectWorkspace";
import { ProjectExplorer } from "./components/ProjectExplorer";
import { importExperiment } from "./api/experiments";
import { usePythonWorkspace } from "./hooks/usePythonWorkspace";
import { usePlatformBridge } from "./hooks/usePlatformBridge";
import type { AgentAttachment } from "./state/agent-attachments";
import { useEditorSync } from "./hooks/useEditorSync";
import { useAgentConversation } from "./hooks/useAgentConversation";
import { Modal } from "./components/Modal";
import { CloseButton } from "./components/CloseButton";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./components/Icons";
import { ModelLibrary } from "./components/ModelLibrary";
import { AgentPanel } from "./components/AgentPanel";
import { Separator } from "./components/Separator";
import { ModelPage } from "./pages/ModelPage";
import { ProgramPage } from "./pages/ProgramPage";
import { ExecutionPage } from "./pages/ExecutionPage";
import { JobsPage } from "./pages/JobsPage";
import { useQuantumWorkspace } from "./hooks/useQuantumWorkspace";
import { usePanelSize } from "./hooks/usePanelSize";
import type { Page } from "./contracts/quantum-workspace";
import { editorFiles } from "./api/editor-files";
import {
  pythonRepairRequest,
  type PythonRepairRequest,
} from "./state/python-failure";

export default function App() {
  const agent = useAgentConversation();
  const [pendingAttachment, setPendingAttachment] = useState<AgentAttachment>();
  const [pendingRepair, setPendingRepair] = useState<PythonRepairRequest>();
  const { state, dispatch, compile, run, setActionContext, backendLabel } =
      useQuantumWorkspace(),
    [sidebarWidth, setSidebarWidth] = usePanelSize("sidebar", 280, 170, 480),
    [guide, setGuide] = useState(false),
    [uploadError, setUploadError] = useState("");
  const bridge = usePlatformBridge(state, dispatch, agent);
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
    if (file.name.toLowerCase().endsWith(".fqx")) {
      setUploadError("");
      importingRef.current = true;
      setImporting(true);
      try {
        const record = await importExperiment(file);
        dispatch({ type: "import-experiment", record, open: true });
      } catch (error) {
        setUploadError(
          error instanceof Error ? error.message : "Cannot import experiment.",
        );
      } finally {
        importingRef.current = false;
        setImporting(false);
      }
      return;
    }
    if (file.size > 32768) {
      setUploadError("Upload a model smaller than 32 KiB.");
      return;
    }
    setUploadError("");
    const source = await file.text(),
      name = file.name.replace(/\.[^.]+$/, "");
    if (program) await compile(source, name);
    else
      dispatch({
        type: "model",
        model: {
          name,
          source,
          language: file.name.endsWith(".py") ? "python" : "qasm",
        },
      });
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
          uploadError={uploadError}
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
          <div className="fq-library-body">
            <button
              className="outline"
              disabled={state.busy || importing}
              onClick={() => programUpload.current?.click()}
            >
              <UIIcon name="upload" size={14} />
              {importing ? "Importing experiment…" : "Upload Quantum Program"}
            </button>
            <small>OpenQASM .qasm · Experiment .fqx (up to 16 MiB)</small>
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
            {(uploadError || state.error) && (
              <p role="alert">{uploadError || state.error?.message}</p>
            )}
            {state.programs.map((p) => (
              <button
                key={p.id}
                className={
                  "fq-library-card " +
                  (p.id === state.selectedProgramId ? "selected" : "")
                }
                onClick={() => dispatch({ type: "program", id: p.id })}
              >
                <span className="fq-library-title">
                  <UIIcon name="circuit" size={14} />
                  {p.name}
                </span>
                <small>
                  {p.compiled.qubits} qubits · depth {p.compiled.depth}
                  {p.experiment && (
                    <>
                      <br />
                      {p.experiment.has_result
                        ? "Saved result"
                        : "No saved result"}{" "}
                      · .fqx
                    </>
                  )}
                  <br />
                  {new Date(p.created).toLocaleString()}
                </small>
              </button>
            ))}
            {!state.programs.length && (
              <p>Compiled programs will appear here.</p>
            )}
          </div>
          <footer>Local snapshots · {state.programs.length}/8 programs</footer>
        </>
      );
    if (state.page === "jobs")
      return (
        <>
          <div className="fq-pane-title">JOBS & SAVED RESULTS</div>
          <div className="fq-library-body">
            {state.jobs.map((j) => (
              <button
                key={j.id}
                className={
                  "fq-library-card " +
                  (state.selectedJobId === j.id ? "selected" : "")
                }
                onClick={() => {
                  if (state.comparison)
                    dispatch({ type: "compare-experiments" });
                  dispatch({ type: "job", id: j.id });
                }}
              >
                {j.status === "completed"
                  ? "✓"
                  : j.status === "failed"
                    ? "!"
                    : "◷"}{" "}
                {j.name}
                <small>{j.experiment ? "Saved .fqx result" : j.status}</small>
              </button>
            ))}
          </div>
          <footer>
            Local history · Executed jobs and imported experiments
          </footer>
        </>
      );
    return (
      <>
        <div className="fq-pane-title">
          {state.page === "execution" ? "EXECUTION BACKEND" : "COMPILER"}
        </div>
        <div className="fq-library-body">
          <h2>
            {state.page === "execution" ? "Remote CPU" : "FlagQuantum compiler"}
          </h2>
          <small className="eyebrow">PYTORCH STATEVECTOR · CPU</small>
          <p>
            OpenQASM 2/3 import and compilation through the installed
            FlagQuantum package.
          </p>
          <p>
            2 CPU threads per task
            <br />1 active task + up to 3 waiting
            <br />
            16 qubits · 100,000 shots maximum
            <br />
            90-second remote process limit
          </p>
          <p>SSH credentials stay in the local environment.</p>
        </div>
      </>
    );
  };
  return (
    <div className="fq-workspace">
      {quickOpen && (
        <QuickOpen
          project={state.project}
          activePath={state.editorLink?.project?.path}
          onOpen={projectWorkspace.openFile}
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
          {uploadError && (
            <div className="fq-diagnostic error" role="alert">
              {uploadError}
              <button onClick={() => setUploadError("")}>×</button>
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
              compile={() => void compile()}
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
              backendLabel={backendLabel}
              state={state}
              dispatch={dispatch}
              run={() => void run()}
            />
          )}
          {state.page === "jobs" && (
            <JobsPage state={state} dispatch={dispatch} />
          )}
          {state.page === "synthesis" && (
            <section className="fq-synthesis">
              <small className="eyebrow">REAL COMPILATION · SSH</small>
              <h1>Compile your quantum circuit.</h1>
              <p>{state.name} · OpenQASM</p>
              <p>
                Inspect gate information and depth from the actual compiler
                output.
              </p>
              <button
                className="primary"
                disabled={state.busy}
                onClick={() => void compile()}
              >
                {state.busy ? "Compiling…" : "Compile model →"}
              </button>
              {state.error && <p role="alert">{state.error.message}</p>}
            </section>
          )}
        </main>
      </div>
      {guide && (
        <Modal
          className="fq-guide"
          label="FlagQuantum guide"
          onClose={() => setGuide(false)}
        >
          <CloseButton
            className="fq-close"
            label="Close guide"
            onClick={() => setGuide(false)}
          />
          <small className="eyebrow">FLAGQUANTUM GUIDE</small>
          <h1>From model to measurement.</h1>
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
