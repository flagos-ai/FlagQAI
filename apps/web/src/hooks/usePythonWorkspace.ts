import { matchesPythonExperiment } from "../state/python-workspace";
import { readExperiment } from "../api/experiments";
import { quantumAPI } from "../api/quantum-workspace";
import { useEffect, useRef, useState } from "react";
import { pythonAPI, type PythonRun } from "../api/python-runs";
import { platformAPI } from "../api/platform";
import type {
  WorkspaceState,
  WorkspaceAction,
} from "../contracts/quantum-workspace";
import type { PlatformBridge } from "./usePlatformBridge";
export function usePythonWorkspace(
  state: WorkspaceState,
  dispatch: React.Dispatch<WorkspaceAction>,
  bridge: PlatformBridge,
) {
  const [run, setRun] = useState<PythonRun>();
  const [runs, setRuns] = useState<PythonRun[]>([]);
  const [environment, setEnvironment] = useState<PythonRun["environment"]>();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const currentRunId = useRef(state.pythonRunId);
  currentRunId.current = state.pythonRunId;
  const lock = useRef(false),
    seen = useRef(new Set<string>());
  useEffect(() => {
    void pythonAPI
      .environment()
      .then(setEnvironment)
      .catch(() => {});
    void pythonAPI
      .list()
      .then(setRuns)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!state.pythonRunId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const result = await pythonAPI.read(
          state.pythonRunId!,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setRun(result);
        setError("");
        setRuns((previous) => [
          result,
          ...previous.filter((item) => item.id !== result.id),
        ]);
        if (result.artifact && !seen.current.has(result.id)) {
          seen.current.add(result.id);
          dispatch({
            type: "import-agent-program",
            program: result.artifact.program,
          });
        }
        for (const reference of result.experiments || []) {
          const key = result.id + ":" + reference.id;
          if (seen.current.has(key)) continue;
          const record = await readExperiment(reference.id, controller.signal);
          if (controller.signal.aborted) return;
          if (!matchesPythonExperiment(result, reference, record))
            throw Error(
              "Saved experiment does not match this Python source snapshot.",
            );
          seen.current.add(key);
          dispatch({ type: "import-experiment", record });
        }
        if (["queued", "running"].includes(result.status))
          timer = setTimeout(refresh, 400);
      } catch (problem) {
        if (!controller.signal.aborted) {
          setError(String(problem));
          timer = setTimeout(refresh, 2000);
        }
      }
    };
    setRun(undefined);
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [state.pythonRunId, dispatch]);
  const start = async () => {
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const result =
        bridge.ready && bridge.session
          ? (
              await platformAPI.action<{ python_run: PythonRun }>({
                client: bridge.client,
                session: bridge.session,
                request_id: crypto.randomUUID(),
                origin: "ui",
                operation: "python.run",
                source: state.source,
                name: state.name,
              })
            ).python_run
          : await pythonAPI.run(state.source, state.name);
      dispatch({ type: "python-run", id: result.id });
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Python submission failed.",
      );
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };
  const cancel = async () => {
    if (!run) return;
    try {
      await pythonAPI.cancel(run.id);
    } catch (problem) {
      setError(String(problem));
    }
  };
  const openCircuit = () => {
    if (run?.artifact) {
      dispatch({ type: "program", id: run.artifact.program.id });
      dispatch({ type: "navigate", page: "program" });
    }
  };
  const openResults = async () => {
    if (run?.artifact?.job) {
      try {
        const job = await quantumAPI.job(run.artifact.job.id);
        dispatch({ type: "merge-jobs", jobs: [job] });
        dispatch({ type: "job", id: run.artifact.job.id });
        dispatch({ type: "navigate", page: "jobs" });
      } catch (problem) {
        setError(String(problem));
      }
    }
  };
  const openExperiment = async (id: string, target: "program" | "jobs") => {
    const reference = run?.experiments?.find((item) => item.id === id);
    if (!run || !reference) return;
    try {
      const record = await readExperiment(id);
      if (currentRunId.current !== run.id) return;
      if (!matchesPythonExperiment(run, reference, record))
        throw Error(
          "Saved experiment does not match this Python source snapshot.",
        );
      dispatch({ type: "import-experiment", record, open: true });
      if (target === "jobs" && record.job) {
        dispatch({ type: "job", id: record.job.id });
        dispatch({ type: "navigate", page: "jobs" });
      }
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Cannot open saved experiment.",
      );
    }
  };
  return {
    run,
    runs,
    environment,
    error,
    submitting,
    start,
    cancel,
    openCircuit,
    openResults,
    openExperiment,
  };
}
export type PythonWorkspace = ReturnType<typeof usePythonWorkspace>;
