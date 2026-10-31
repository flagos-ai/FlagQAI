import { useEffect, useRef, useState } from "react";
import { projectsAPI } from "../api/projects";
import {
  projectDirty,
  type ProjectInfo,
  type ProjectTab,
} from "../state/project-workspace";
import type {
  WorkspaceState,
  WorkspaceAction,
} from "../contracts/quantum-workspace";
export function useProjectWorkspace(
  state: WorkspaceState,
  dispatch: React.Dispatch<WorkspaceAction>,
) {
  const [registry, setRegistry] = useState<{
    workspace_root: string;
    projects: ProjectInfo[];
  }>({ workspace_root: "", projects: [] });
  const [refreshError, setRefreshError] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  const operation = useRef(false);
  const refreshRegistry = () =>
    projectsAPI
      .list()
      .then(setRegistry)
      .catch((problem) => setError(String(problem)));
  useEffect(() => {
    void refreshRegistry();
  }, []);
  useEffect(() => {
    if (!state.project) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const tree = await projectsAPI.tree(
          state.project!.id,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        dispatch({ type: "project-select", project: tree });
        setRefreshError("");
        for (const tab of latest.current.projectTabs || []) {
          if (tab.closed || tab.id === latest.current.activeProjectTab)
            continue;
          try {
            const started = Date.now();
            const file = await projectsAPI.read(
              tab.project.id,
              tab.path,
              controller.signal,
            );
            file.observedAt = started;
            if (!controller.signal.aborted)
              dispatch({ type: "project-file-update", file });
          } catch {
            /* Missing files retain their cached drafts. Reopening reports the error. */
          }
        }
      } catch (problem) {
        if (!controller.signal.aborted) setRefreshError(String(problem));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [state.project?.id, dispatch]);
  const perform = async (task: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
      return true;
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Project action failed.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const openProject = (path: string, create = false) =>
    perform(async () => {
      const project = await projectsAPI.open(path, create);
      dispatch({ type: "project-select", project });
      await refreshRegistry();
    });
  const openFile = (path: string) =>
    perform(async () => {
      const project = latest.current.project;
      if (!project) return;
      if (path.toLowerCase().endsWith(".fqx")) {
        const record = await projectsAPI.artifact(project.id, path);
        dispatch({ type: "import-experiment", record, open: true });
        return;
      }
      try {
        const file = await projectsAPI.read(project.id, path);
        dispatch({ type: "project-open-file", project, file });
      } catch (problem) {
        const cached = latest.current.projectTabs?.find(
          (tab) => tab.project.id === project.id && tab.path === path,
        );
        if (cached) dispatch({ type: "project-tab", id: cached.id });
        throw problem;
      }
    });
  const save = () =>
    perform(async () => {
      const current = latest.current;
      const tab = current.projectTabs?.find(
        (item) => item.id === current.activeProjectTab,
      );
      if (tab)
        await saveProjectTab(
          {
            ...tab,
            source: current.source,
            editorLink: current.editorLink || tab.editorLink,
          },
          dispatch,
        );
      else dispatch({ type: "save" });
    });
  const saveAll = () =>
    perform(async () => {
      for (const tab of latest.current.projectTabs || [])
        if (projectDirty(tab)) await saveProjectTab(tab, dispatch);
    });
  const createFile = (path: string) =>
    perform(async () => {
      const project = latest.current.project;
      if (!project) return;
      const file = await projectsAPI.save(project.id, path, "");
      dispatch({ type: "project-open-file", project, file });
    });
  return {
    registry,
    error: error || refreshError,
    busy,
    openProject,
    openFile,
    createFile,
    save,
    saveAll,
  };
}
export type ProjectWorkspace = ReturnType<typeof useProjectWorkspace>;

export async function saveProjectTab(
  tab: ProjectTab,
  dispatch: React.Dispatch<WorkspaceAction>,
) {
  if (tab.editorLink.incoming)
    throw Error(`Review incoming changes in ${tab.path} before saving.`);
  try {
    const file = await projectsAPI.save(
      tab.project.id,
      tab.path,
      tab.source,
      tab.editorLink.revision,
    );
    dispatch({ type: "project-file-saved", file, source: tab.source });
    return file;
  } catch (problem) {
    try {
      const file = await projectsAPI.read(tab.project.id, tab.path);
      dispatch({
        type: "file-changed",
        id: file.id,
        source: file.source,
        revision: file.revision,
        time: Date.now(),
      });
      dispatch({ type: "project-file-update", file });
    } catch {
      /* Retain the browser draft if the disk file is unavailable. */
    }
    throw Error(
      tab.path +
        ": " +
        (problem instanceof Error ? problem.message : "Cannot save file."),
    );
  }
}
