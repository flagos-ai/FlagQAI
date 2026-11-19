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
  checkNotebook: (id: string, signal?: AbortSignal) =>
    request<NotebookEnvironment>("/notebook/check", { id }, signal),
  notebook: (id: string, requestId: string) =>
    request<{ project: ProjectInfo; file: ProjectFile }>("/notebook", {
      id,
      request_id: requestId,
    }),
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

export type NotebookEnvironment = {
  status: "ready" | "sdk_incompatible" | "missing_dependencies" | "unavailable";
  environment_revision: number;
  transport: string;
  timeout_seconds: number;
  source_hash: string;
  runtime?: { sdk_version?: string; python?: string };
  incompatible_sdk?: { name: string; detail: string }[];
  missing_dependencies?: { name: string; detail: string }[];
  notes: string[];
  error?: string;
  preparation: {
    commands: string;
    guidance: string;
    unmapped_imports: string[];
  };
};
