import { quantumAPI } from "../api/quantum-workspace";
import { useEffect, useRef, useState } from "react";
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
  const [actions, setActions] = useState<PlatformAction[]>([]);
  const [follow, setFollow] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [backend, setBackend] = useState("");
  const current = useRef(state);
  current.current = state;
  const followRef = useRef(follow);
  followRef.current = follow;
  const session = agent.session?.sessionId;
  const turnSeq = agent.view.lastUserSeq;
  const open = async (action: PlatformAction) => {
    const result = action.result;
    if (!result) return;
    if (result.file && action.operation === "model.create")
      dispatch({
        type: "open-agent-model",
        model: {
          name: result.name || "Agent model",
          source: result.file.source,
          language: result.file.id.endsWith(".py") ? "python" : "qasm",
        },
        file: result.file,
      });
    if (result.python_run) {
      dispatch({ type: "python-run", id: result.python_run.id });
      dispatch({ type: "language", language: "python" });
      dispatch({ type: "navigate", page: "model" });
    }
    if (result.program) {
      dispatch({ type: "import-agent-program", program: result.program });
      const existing = current.current.programs.find(
        (p) => p.id === result.program!.id,
      );
      dispatch({ type: "program", id: existing?.id || result.program.id });
      dispatch({ type: "navigate", page: "program" });
    }
    if (result.job) {
      try {
        dispatch({
          type: "merge-jobs",
          jobs: [await quantumAPI.job(result.job.id)],
        });
      } catch (problem) {
        setError(String(problem));
        return;
      }
      dispatch({ type: "job", id: result.job.id });
      dispatch({ type: "navigate", page: "jobs" });
    }
    if (result.page) {
      if (result.program_id)
        dispatch({ type: "program", id: result.program_id });
      if (result.job_id) dispatch({ type: "job", id: result.job_id });
      dispatch({ type: "navigate", page: result.page as Page });
    }
    dispatch({ type: "agent", open: true });
  };
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    seen.current.clear();
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
            language: snapshot.language || "qasm",
            name: snapshot.name,
            source: snapshot.source,
            editorFile: snapshot.editorLink?.id,
            selectedProgramId: snapshot.selectedProgramId,
            selectedJobId: snapshot.selectedJobId,
            shots: snapshot.shots,
            seed: snapshot.seed,
            dirty: !snapshot.models.some(
              (m) => m.name === snapshot.name && m.source === snapshot.source,
            ),
            turnSeq,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setReady(true);
        setError("");
        setBackend(result.backend.transport + " · " + result.backend.backend);
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
    const poll = async () => {
      try {
        const records = await platformAPI.events(
          client,
          session,
          cursor,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        for (const record of records) {
          cursor = Math.max(cursor, record.seq);
          if (seen.current.has(record.seq)) continue;
          seen.current.add(record.seq);
          const result = record.result;
          if (result?.python_run)
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
            record.origin !== "ui" &&
            followRef.current &&
            (result?.python_run ||
              result?.program ||
              result?.job ||
              result?.page ||
              record.operation === "model.create")
          )
            openRef.current(record);
        }
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
  return {
    client,
    session,
    ready,
    error,
    backend,
    actions,
    follow,
    setFollow,
    open,
    controls:
      ready && session
        ? {
            schema: "flagqai.workspace-controls.v1",
            command: [
              "python3",
              "packages/quantum-workspace/workbench.py",
              "--port",
              location.port,
              "--client",
              client,
              "--session",
              session,
            ],
            page: state.page,
            language: state.language || "qasm",
            model: state.name,
            sharedModelId: state.editorLink?.id,
            dirty: !state.models.some(
              (m) => m.name === state.name && m.source === state.source,
            ),
            backend,
            usage:
              'Python: use model.create --language python for .py files; python.run --model-id ID --revision REV submits Python; python.read --run-id ID retrieves live logs, collection_errors and experiments references; experiment.read --experiment-id ID reads a saved circuit and its recorded result; python.cancel --run-id ID stops it. Use fq.save("result.fqx", result.plan, result=result) to save actual SDK experiments. Files are automatically collected only from this fresh task directory; multiple files are supported. Check collection_status and collection_errors separately from Python exit status. Never send Python to compile or QASM run. Use the native shell tool with this command prefix and --request-id UUID before mutating operations. status reads current state; draft.read reads the browser snapshot; model.share --expected-hash HASH creates a linked file safely; model.create --source-file WORKSPACE_FILE --name NAME creates a new model; model.read --model-id ID returns revision and path; compile --model-id ID --revision REV returns program.id; run --program-id ID --shots N --seed N returns job.id; job.read --job-id ID returns real status/results. Reuse request IDs for retries. Do not overwrite a browser draft. Do not claim success before receiving an actual result. Compute backend is shown explicitly; never substitute a manual simulation.',
          }
        : undefined,
  };
}
export type PlatformBridge = ReturnType<typeof usePlatformBridge>;
