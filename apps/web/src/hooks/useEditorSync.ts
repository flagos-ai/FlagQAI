import { projectsAPI } from "../api/projects";
import { useEffect, useRef, useState } from "react";
import { editorFiles } from "../api/editor-files";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
export function useEditorSync(
  state: WorkspaceState,
  dispatch: React.Dispatch<WorkspaceAction>,
) {
  const [error, setError] = useState(""),
    [sharing, setSharing] = useState(false);
  const current = useRef(state);
  current.current = state;
  const operation = useRef(false);
  const id = state.editorLink?.id;
  useEffect(() => {
    setError("");
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const started = Date.now();
        const project = state.editorLink?.project;
        const file = project
          ? await projectsAPI.read(project.id, project.path, controller.signal)
          : await editorFiles.read(id, controller.signal);
        if (controller.signal.aborted) return;
        dispatch({
          type: "file-changed",
          id,
          source: file.source,
          revision: file.revision,
          time: started,
        });
        setError("");
      } catch (problem) {
        if (!controller.signal.aborted)
          setError(
            problem instanceof Error ? problem.message : "File sync failed.",
          );
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 600);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, dispatch]);
  const share = async () => {
    if (operation.current || current.current.editorLink) return;
    operation.current = true;
    setSharing(true);
    setError("");
    const snapshot = current.current;
    try {
      const file = await editorFiles.create(snapshot.source, snapshot.language);
      // Switching models while the request is in flight cannot attach the old file.
      if (
        current.current.name === snapshot.name &&
        current.current.language === snapshot.language
      )
        dispatch({
          type: "link-editor",
          name: snapshot.name,
          expectedSource: snapshot.source,
          file,
        });
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Cannot share model.",
      );
    } finally {
      operation.current = false;
      setSharing(false);
    }
  };
  return { share, sharing, error };
}
export type EditorSync = ReturnType<typeof useEditorSync>;
