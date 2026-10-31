import { saveProjectTab } from "./useProjectWorkspace";
import { projectsAPI } from "../api/projects";
import { checkpointProject, projectDirty } from "../state/project-workspace";
import { matchesPythonExperiment } from "../state/python-workspace";
import { importExperiment, readExperiment } from "../api/experiments";
import { loadPythonExperiments } from "../api/python-experiments";
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
  const [recovering, setRecovering] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [previews, setPreviews] = useState<{
    runId: string;
    files: Record<
      string,
      { status: "loading" | "loaded" | "failed"; error?: string }
    >;
  }>({ runId: "", files: {} });
  const recoveryLock = useRef(false);
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
        const pending = (result.experiments || []).filter(
          (reference) => !seen.current.has(result.id + ":" + reference.id),
        );
        setPreviews((previous) => ({
          runId: result.id,
          files: {
            ...(previous.runId === result.id ? previous.files : {}),
            ...Object.fromEntries(
              (result.experiments || []).map((item) => [
                item.id,
                {
                  status: seen.current.has(result.id + ":" + item.id)
                    ? ("loaded" as const)
                    : ("loading" as const),
                },
              ]),
            ),
          },
        }));
        const loaded = await loadPythonExperiments(
          { ...result, experiments: pending },
          readExperiment,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        for (const item of loaded) {
          if (item.record) {
            seen.current.add(result.id + ":" + item.id);
            dispatch({ type: "import-experiment", record: item.record });
          }
        }
        setPreviews((previous) => ({
          runId: result.id,
          files: {
            ...(previous.runId === result.id ? previous.files : {}),
            ...Object.fromEntries(
              loaded.map((item) => [
                item.id,
                {
                  status: item.record
                    ? ("loaded" as const)
                    : ("failed" as const),
                  error: item.error,
                },
              ]),
            ),
          },
        }));
        if (
          ["queued", "running"].includes(result.status) ||
          result.collection_status === "collecting"
        )
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
  }, [state.pythonRunId, refreshVersion, dispatch]);
  const recollect = async () => {
    if (!run || recoveryLock.current) return;
    recoveryLock.current = true;
    setRecovering(true);
    setError("");
    try {
      await pythonAPI.collect(run.id);
      if (currentRunId.current === run.id)
        setRefreshVersion((value) => value + 1);
    } catch (problem) {
      if (currentRunId.current === run.id) setError(String(problem));
    } finally {
      recoveryLock.current = false;
      setRecovering(false);
    }
  };
  const importFile = async (file: File) => {
    if (recoveryLock.current) return;
    recoveryLock.current = true;
    setImporting(true);
    setError("");
    try {
      const record = await importExperiment(file);
      dispatch({ type: "import-experiment", record, open: true });
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Cannot import experiment.",
      );
    } finally {
      recoveryLock.current = false;
      setImporting(false);
    }
  };
  const start = async (saveProject = false) => {
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const project = state.editorLink?.project;
      const dirtyDependencies =
        project &&
        state.projectTabs?.filter(
          (tab) =>
            tab.project.id === project.id &&
            tab.id !== state.activeProjectTab &&
            projectDirty(tab),
        );
      let entryRevision = state.editorLink?.revision;
      if (project && saveProject) {
        for (const tab of checkpointProject(state).projectTabs || []) {
          if (tab.project.id !== project.id || !projectDirty(tab)) continue;
          const saved = await saveProjectTab(tab, dispatch);
          if (tab.id === state.activeProjectTab) entryRevision = saved.revision;
        }
      }
      if (!saveProject && dirtyDependencies && dirtyDependencies.length)
        throw Error(
          "Save project dependencies before running: " +
            dirtyDependencies.map((tab) => tab.path).join(", ") +
            ". The entry draft can run without saving.",
        );
      const result = project
        ? bridge.ready && bridge.session
          ? (
              await platformAPI.action<{ python_run: PythonRun }>({
                client: bridge.client,
                session: bridge.session,
                request_id: crypto.randomUUID(),
                origin: "ui",
                operation: "project.run",
                project_id: project.id,
                entry: project.path,
                source: state.source,
                expected_revision: entryRevision,
              })
            ).python_run
          : await projectsAPI.run(
              project.id,
              project.path,
              state.source,
              entryRevision!,
            )
        : bridge.ready && bridge.session
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
    recovering,
    importing,
    previews: previews.runId === state.pythonRunId ? previews.files : {},
    retryLoading: () => setRefreshVersion((value) => value + 1),
    recollect,
    importFile,
    start,
    cancel,
    openCircuit,
    openResults,
    openExperiment,
  };
}
export type PythonWorkspace = ReturnType<typeof usePythonWorkspace>;
