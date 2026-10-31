import type { ProjectFile, ProjectInfo } from "../state/project-workspace";
import type { ExperimentImport } from "../contracts/quantum-workspace";
import type { PythonRun } from "./python-runs";
async function request<T>(
  path: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/projects" + path, {
    signal,
    ...(data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(
      value.error || "Project request failed; your draft is retained.",
    );
  return value;
}
export const projectsAPI = {
  list: () => request<{ workspace_root: string; projects: ProjectInfo[] }>(""),
  open: (path: string, create = false) =>
    request<ProjectInfo>("", { path, create }),
  tree: (id: string, signal?: AbortSignal) =>
    request<ProjectInfo>("/" + id, undefined, signal),
  read: (id: string, path: string, signal?: AbortSignal) =>
    request<ProjectFile>(
      "/" + id + "/file?path=" + encodeURIComponent(path),
      undefined,
      signal,
    ),
  save: (id: string, path: string, source: string, revision?: string) =>
    request<ProjectFile>("/" + id + "/file", {
      path,
      source,
      expected_revision: revision,
    }),
  run: (id: string, entry: string, source: string, revision: string) =>
    request<PythonRun>("/" + id + "/run", {
      entry,
      source,
      expected_revision: revision,
    }),
  artifact: (id: string, path: string) =>
    request<ExperimentImport>("/" + id + "/artifact", { path }),
};
