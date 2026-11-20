import {
  notebookGuidance,
  type NotebookContext,
} from "../state/notebook-context";
import { researchRunsAPI } from "../api/research-runs";
import { previewCode } from "../state/agent-code-preview";
import { readExperiment } from "../api/experiments";
import { pythonAPI } from "../api/python-runs";
import {
  platformNavigation,
  shouldFollowTarget,
} from "../state/platform-navigation";
import { quantumAPI } from "../api/quantum-workspace";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  WorkspaceState,
  WorkspaceAction,
  Page,
} from "../contracts/quantum-workspace";
import type { AgentConversation } from "./useAgentConversation";
import { platformAPI, type PlatformAction } from "../api/platform";
export function usePlatformBridge(
  state: WorkspaceState,
  dispatch: React.Dispatch<WorkspaceAction>,
  agent: AgentConversation,
  notebook?: NotebookContext,
) {
  const [client] = useState(() => {
    try {
      const existing = sessionStorage.getItem("fq-platform-client-v1");
      if (existing && /^[a-zA-Z0-9-]{1,128}$/.test(existing)) return existing;
      const id = crypto.randomUUID();
      sessionStorage.setItem("fq-platform-client-v1", id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  });
  const seen = useRef(new Set<number>());
  const baseline = useRef<number | undefined>(undefined);
  const [actions, setActions] = useState<PlatformAction[]>([]);
  const [follow, setFollow] = useState(() => {
    try {
      return localStorage.getItem("fq-follow-agent-v1") === "on";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("fq-follow-agent-v1", follow ? "on" : "off");
    } catch {
      // Following still works when browser storage is unavailable.
    }
  }, [follow]);
  const [ready, setReady] = useState(false);
  const documentKey = JSON.stringify([
    state.page,
    notebook?.id,
    notebook?.source,
    state.name,
    state.source,
    state.language,
    state.editorLink?.id,
  ]);
  const [publishedDocument, setPublishedDocument] = useState("");
  const contextReady = ready && publishedDocument === documentKey;
  const [error, setError] = useState("");
  const [backend, setBackend] = useState("");
  const [adapterPath, setAdapterPath] = useState(
    "packages/quantum-workspace/workbench.py",
  );
  const current = useRef(state);
  current.current = state;
  const followRef = useRef(follow);
  followRef.current = follow;
  const session = agent.session?.sessionId;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const turnSeq = agent.view.lastUserSeq;
  const open = async (
    action: PlatformAction,
    allowed = () => true,
    automatic = false,
  ) => {
    try {
      const changes = await platformNavigation(
        action,
        current.current,
        {
          experiment: readExperiment,
          job: quantumAPI.job,
          research: async (id) =>
            (await researchRunsAPI.read(id, new AbortController().signal)).run,
        },
        automatic,
      );
      if (allowed()) for (const change of changes) dispatch(change);
    } catch (problem) {
      if (!allowed()) return;
      setError(
        "Could not open Agent target: " +
          (problem instanceof Error ? problem.message : String(problem)),
      );
    }
  };
  const compare = async (left: string, right: string) => {
    const records = await Promise.all([
      readExperiment(left),
      readExperiment(right),
    ]);
    if (
      !records.every(
        (record) => record.job && record.program.experiment?.has_result,
      )
    )
      throw Error("Both experiments need saved measurement results.");
    for (const record of records)
      dispatch({ type: "import-experiment", record });
    dispatch({ type: "compare-experiments", left, right });
    dispatch({ type: "agent", open: true });
  };
  // Explicit inspection selects an existing run without opening or replacing source.
  const inspectRun = async (id: string) => {
    const run = await pythonAPI.read(id);
    if (run.id !== id) throw Error("Run identity did not match.");
    dispatch({ type: "python-run", id });
    dispatch({ type: "language", language: "python" });
    dispatch({ type: "navigate", page: "model" });
    dispatch({ type: "agent", open: true });
  };
  const openResearch = async (id: string) => {
    if (!/^invsqrt-[a-f0-9]{32}$/.test(id))
      throw Error("Invalid research run identity.");
    const record = await researchRunsAPI.read(id, new AbortController().signal);
    if (record.run.id !== id)
      throw Error("Research run identity did not match.");
    if (sessionRef.current !== session)
      throw Error("Agent session changed. Open this record again.");
    dispatch({ type: "research-run", id });
    dispatch({ type: "agent", open: true });
  };
  const openCircuit = async (id: string) => {
    const record = await readExperiment(id);
    if (record.id !== id || record.program.id !== id)
      throw Error("Circuit identity did not match.");
    dispatch({ type: "import-experiment", record, open: true });
    dispatch({ type: "agent", open: true });
  };
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    seen.current.clear();
    baseline.current = undefined;
    setActions([]);
    setReady(false);
    setError("");
  }, [session]);
  useEffect(() => {
    if (!session || agent.phase !== "connected") return;
    const controller = new AbortController();
    const publish = async () => {
      const snapshot = current.current;
      try {
        const result = await platformAPI.publish(
          {
            client,
            session,
            page: snapshot.page,
            language: notebook ? "notebook" : snapshot.language || "qasm",
            name: notebook ? notebook.title.slice(0, 200) : snapshot.name,
            source: notebook ? notebook.source : snapshot.source,
            notebookId: notebook?.id,
            editorFile: notebook ? undefined : snapshot.editorLink?.id,
            selectedProgramId: snapshot.selectedProgramId,
            selectedJobId: snapshot.selectedJobId,
            shots: snapshot.shots,
            seed: snapshot.seed,
            dirty: notebook
              ? notebook.dirty
              : !snapshot.models.some(
                  (m) =>
                    m.name === snapshot.name && m.source === snapshot.source,
                ),
            turnSeq,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (baseline.current === undefined) {
          // Establish history before enabling Send. Actions created after this
          // watermark must follow even if they arrive in the first polling batch.
          let watermark = 0;
          while (true) {
            const records = await platformAPI.events(
              client,
              session,
              watermark,
              controller.signal,
            );
            if (controller.signal.aborted) return;
            for (const record of records)
              watermark = Math.max(watermark, record.seq);
            if (records.length < 100) break;
          }
          baseline.current = watermark;
        }
        setPublishedDocument(documentKey);
        setReady(true);
        setError("");
        setBackend(result.backend.transport + " · " + result.backend.backend);
        setAdapterPath(
          result.adapter_path || "packages/quantum-workspace/workbench.py",
        );
      } catch (problem) {
        if (!controller.signal.aborted) {
          setReady(false);
          setError(
            problem instanceof Error
              ? problem.message
              : "Workbench bridge unavailable.",
          );
        }
      }
    };
    const timer = setTimeout(() => void publish(), 120);
    const heartbeat = setInterval(() => void publish(), 15000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(heartbeat);
    };
  }, [
    session,
    agent.phase,
    client,
    notebook,
    documentKey,
    state.source,
    state.language,
    state.name,
    state.page,
    state.editorLink?.id,
    state.selectedProgramId,
    state.selectedJobId,
    state.shots,
    state.seed,
    turnSeq,
  ]);
  useEffect(() => {
    if (!session || !ready) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      cursor = 0;
    // Restore old cards/resources, but follow only events newer than the
    // pre-Send watermark. A Running action settles with a new sequence.
    const poll = async () => {
      try {
        const records = await platformAPI.events(
          client,
          session,
          cursor,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        let target: PlatformAction | undefined;
        for (const record of records) {
          cursor = Math.max(cursor, record.seq);
          if (seen.current.has(record.seq)) continue;
          seen.current.add(record.seq);
          const result = record.result;
          if (result?.python_run && record.seq > (baseline.current ?? Infinity))
            dispatch({ type: "python-run", id: result.python_run.id });
          if (result?.program)
            dispatch({ type: "import-agent-program", program: result.program });
          if (result?.file && result.name) {
            if (record.operation === "model.create")
              dispatch({
                type: "add-agent-model",
                model: {
                  name: result.name,
                  source: result.file.source,
                  language: result.file.id.endsWith(".py") ? "python" : "qasm",
                },
              });
            if (
              record.operation === "model.share" &&
              current.current.name === result.expected_name &&
              current.current.editorLink?.id ===
                (result.expected_link || undefined)
            )
              dispatch({
                type: "link-editor",
                name: result.expected_name,
                expectedSource: result.expected_source || "",
                file: result.file,
              });
          }
          if (result?.job) {
            // Submission snapshots enter the same Jobs store; polling supplies results.
            const job = await fetch(
              "/api/jobs/" + encodeURIComponent(result.job.id),
              { signal: controller.signal },
            ).then((r) => r.json());
            if (!controller.signal.aborted && job.id)
              dispatch({
                type: "merge-jobs",
                jobs: [
                  job,
                  ...current.current.jobs.filter((j) => j.id !== job.id),
                ],
              });
          }
          if (
            record.status === "completed" &&
            record.seq > (baseline.current ?? Infinity) &&
            record.origin !== "ui" &&
            followRef.current &&
            shouldFollowTarget(current.current, record) &&
            (result?.python_run ||
              result?.program ||
              result?.job ||
              result?.page ||
              record.operation === "model.create")
          ) {
            const priority = (action: PlatformAction) =>
              action.result?.page
                ? 100
                : action.result?.job
                  ? 60
                  : action.result?.program
                    ? 50
                    : action.operation === "model.create"
                      ? 30
                      : 20;
            if (!target || priority(record) >= priority(target))
              target = record;
          }
        }
        const selected = target;
        if (selected)
          await openRef.current(
            selected,
            () =>
              !controller.signal.aborted &&
              followRef.current &&
              shouldFollowTarget(current.current, selected),
            true,
          );
        if (records.length)
          setActions((previous) => {
            const map = new Map(previous.map((item) => [item.id, item]));
            records.forEach((item) => map.set(item.id, item));
            return [...map.values()].slice(-50);
          });
      } catch {
        /* Reconnect without replacing editor drafts or claiming success. */
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 700);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, session, ready, dispatch]);
  const activeProject = state.projectTabs?.find(
    (tab) => tab.id === state.activeProjectTab,
  )?.project;
  const projectContext = activeProject || state.project;
  const preview = useMemo(
    () =>
      follow && agent.phase === "connected"
        ? previewCode(agent.view.codeStream)
        : undefined,
    [follow, agent.phase, agent.view.codeStream],
  );
  const liveCode =
    preview?.requestId &&
    actions.some(
      (action) =>
        action.operation === "model.create" &&
        action.id === preview.requestId &&
        action.status !== "running",
    )
      ? undefined
      : preview;
  const previewId = liveCode?.id;
  useEffect(() => {
    if (previewId) dispatch({ type: "navigate", page: "model" });
  }, [previewId, dispatch]);
  return {
    client,
    session,
    ready: contextReady,
    error,
    backend,
    actions,
    liveCode,
    follow,
    setFollow,
    open,
    inspectRun,
    openResearch,
    openCircuit,
    compare,
    controls:
      contextReady && session
        ? {
            schema: "flagqai.workspace-controls.v1",
            command: [
              "python3",
              adapterPath,
              "--port",
              location.port,
              "--client",
              client,
              "--session",
              session,
            ],
            followAgent: follow,
            page: state.page,
            language: notebook ? "notebook" : state.language || "qasm",
            model: notebook ? notebook.title : state.name,
            notebookId: notebook?.id,
            activeDocumentGuidance: notebook ? notebookGuidance : undefined,
            project:
              !notebook && projectContext
                ? {
                    id: projectContext.id,
                    path: projectContext.path,
                    root: projectContext.root,
                    entry: state.editorLink?.project?.path,
                    snapshot_hash: projectContext.snapshot_hash,
                  }
                : undefined,
            sharedModelId: notebook ? undefined : state.editorLink?.id,
            dirty: notebook
              ? notebook.dirty
              : !state.models.some(
                  (m) => m.name === state.name && m.source === state.source,
                ),
            backend,
            preferredTools: [
              "workbench_inspect",
              "workbench_create_python",
              "workbench_run_python",
              "workbench_wait_run",
              "workbench_present_experiment",
              "workbench_compare_experiments",
            ],
            toolGuidance:
              "When these native tools are available, call them directly instead of reading platform implementation or constructing shell commands. Run with the managed SDK, inspect actual saved artifacts, and finish by presenting the circuit and result or the requested comparison. The command adapter below remains a fallback for older runtimes and project/QASM operations.",
            usage:
              'Projects: when project metadata is present, edit actual files under the displayed project root using native file tools; project.inspect --project-id ID returns input hashes and paths, and project.run --project-id ID --entry PATH --expected-hash HASH executes a frozen multi-file snapshot. Never overwrite an unsaved browser draft; disk changes are reviewed independently. Python: use model.create --language python for .py files; python.run --model-id ID --revision REV submits Python; python.read --run-id ID retrieves live logs, collection_errors and experiments references; experiment.read --experiment-id ID reads a saved circuit and its recorded result; python.cancel --run-id ID stops it. Use fq.save("result.fqx", result.plan, result=result) to save actual SDK experiments. Files are automatically collected only from this fresh task directory; multiple files are supported. Check collection_status and collection_errors separately from Python exit status. Never send Python to compile or QASM run. Use the native shell tool with this command prefix and --request-id UUID before mutating operations. For visible workflow milestones, use focus --page model, focus --page program --program-id ID, or focus --page jobs --job-id ID after verifying the target. Focus follows only when the user enables Follow Agent. status reads current state; draft.read reads the browser snapshot; model.share --expected-hash HASH creates a linked file safely; model.create --source-file WORKSPACE_FILE --name NAME creates a new model; model.read --model-id ID returns revision and path; compile --model-id ID --revision REV returns program.id; run --program-id ID --shots N --seed N returns job.id; job.read --job-id ID returns real status/results. Reuse request IDs for retries. Do not overwrite a browser draft. Do not claim success before receiving an actual result. Compute backend is shown explicitly; never substitute a manual simulation.',
          }
        : undefined,
  };
}
export type PlatformBridge = ReturnType<typeof usePlatformBridge>;
