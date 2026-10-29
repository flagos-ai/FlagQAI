import { listExperiments } from "../api/experiments";
import { platformAPI } from "../api/platform";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { quantumAPI } from "../api/quantum-workspace";
import { workspaceReducer } from "../state/reducer";
import { persistWorkspace, restoreWorkspace } from "../state/persistence";
import type {
  CompiledProgram,
  ProgramSnapshot,
  QuantumJob,
} from "../contracts/quantum-workspace";

export function useQuantumWorkspace() {
  const [backendLabel, setBackendLabel] = useState("Configured CPU backend");
  useEffect(() => {
    let live = true;
    void quantumAPI
      .health()
      .then((health) => {
        if (live)
          setBackendLabel(
            health.backend === "test-only"
              ? "Scripted compute fixture"
              : "PyTorch CPU · " + health.transport,
          );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const actionContext = useRef<{ client: string; session: string } | undefined>(
    undefined,
  );
  const operation = useRef(false);
  const setActionContext = (
    value: { client: string; session: string } | undefined,
  ) => {
    actionContext.current = value;
  };
  const [state, dispatch] = useReducer(workspaceReducer, undefined, () =>
    restoreWorkspace(localStorage, location.hash.slice(1)),
  );
  useEffect(() => {
    let live = true;
    void listExperiments()
      .then((records) => {
        if (live) dispatch({ type: "restore-experiments", records });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => persistWorkspace(localStorage, state), [state]);
  useEffect(() => {
    history.replaceState(null, "", "#" + state.page);
  }, [state.page]);
  useEffect(() => {
    const change = () =>
      dispatch({
        type: "navigate",
        page: restoreWorkspace(localStorage, location.hash.slice(1)).page,
      });
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const compile = useCallback(
    async (source = state.source, name = state.name) => {
      if (state.busy || operation.current) return;
      if (state.language === "python" && source === state.source) {
        dispatch({ type: "navigate", page: "model" });
        dispatch({
          type: "error",
          source,
          message: "Use Run Python in Model to execute this file.",
        });
        return;
      }
      operation.current = true;
      dispatch({ type: "busy", value: true });
      try {
        const context = actionContext.current;
        const response = context
          ? await platformAPI.action<{ program: ProgramSnapshot }>({
              ...context,
              request_id: crypto.randomUUID(),
              operation: "compile",
              origin: "ui",
              source,
              name,
            })
          : undefined;
        const compiled =
          response?.program.compiled || (await quantumAPI.compile(source));
        dispatch({
          type: "compiled",
          program: response?.program || {
            id: crypto.randomUUID(),
            name,
            source,
            compiled,
            created: Date.now(),
          },
        });
      } catch (error) {
        dispatch({
          type: "error",
          source,
          message:
            error instanceof Error ? error.message : "Compilation failed.",
        });
      } finally {
        operation.current = false;
        dispatch({ type: "busy", value: false });
      }
    },
    [state.busy, state.source, state.name, state.language],
  );
  const run = useCallback(async () => {
    if (state.busy || operation.current) return;
    operation.current = true;
    dispatch({ type: "busy", value: true });
    const source = state.execution?.source || state.source;
    try {
      const context = actionContext.current;
      const job = context
        ? (
            await platformAPI.action<{ job: QuantumJob }>({
              ...context,
              request_id: crypto.randomUUID(),
              operation: "run",
              origin: "ui",
              source,
              shots: state.shots,
              seed: state.seed,
              name: state.jobName || state.execution?.name || state.name,
            })
          ).job
        : await quantumAPI.submit(
            source,
            state.shots,
            state.seed,
            state.jobName || state.execution?.name || state.name,
          );
      dispatch({ type: "merge-jobs", jobs: [job] });
      dispatch({ type: "job", id: job.id });
      dispatch({ type: "navigate", page: "jobs" });
    } catch (error) {
      dispatch({
        type: "error",
        source,
        message: error instanceof Error ? error.message : "Submission failed.",
      });
    } finally {
      operation.current = false;
      dispatch({ type: "busy", value: false });
    }
  }, [state]);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const jobs = await quantumAPI.jobs();
        if (!live) return;
        dispatch({ type: "jobs", jobs });
        for (const job of jobs.slice().reverse())
          if (
            job.result &&
            !job.experiment &&
            !state.programs.some((p) => p.source === job.request.source)
          ) {
            // Recovery is source-bound and never replaces the Model draft or page.
            const { counts: _, ...compiled } = job.result;
            const record = {
              id: job.id,
              name: job.name,
              source: job.request.source,
              compiled: compiled as CompiledProgram,
              created: Date.now(),
            };
            dispatch({ type: "recover-program", program: record });
          }
        timer = setTimeout(refresh, 2000);
      } catch {
        if (live) timer = setTimeout(refresh, 3000);
        /* Existing snapshots stay available while the local service is offline. */
      }
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [state.page]);
  return { state, dispatch, compile, run, setActionContext, backendLabel };
}
