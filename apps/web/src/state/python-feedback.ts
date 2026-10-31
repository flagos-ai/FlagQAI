import type { PythonRun } from "../api/python-runs.ts";
import type { WorkspaceState } from "../contracts/quantum-workspace.ts";
import { projectDirty } from "./project-workspace.ts";
export type ResultFreshness = "current" | "changed" | "other-file" | "unknown";
/** Compare the frozen entry and dependencies without rewriting historical results. */
export function pythonResultFreshness(
  run: PythonRun,
  state: WorkspaceState,
): ResultFreshness {
  const project = run.project;
  if (
    project &&
    (state.editorLink?.project?.id !== project.id ||
      state.editorLink.project.path !== project.entry)
  )
    return "other-file";
  if (run.source !== state.source) return "changed";
  if (!project) return "current";
  for (const tab of state.projectTabs || []) {
    if (tab.project.id !== project.id || tab.path === project.entry) continue;
    const recorded = project.files.find((file) => file.path === tab.path);
    if (
      recorded &&
      (projectDirty(tab) ||
        (!tab.closed && tab.editorLink.revision !== recorded.sha256))
    )
      return "changed";
  }
  const tree = state.project?.id === project.id ? state.project : undefined;
  if (!tree?.files || tree.truncated || tree.errors?.length) return "unknown";
  const sources = tree.files.filter((file) => file.kind === "source");
  if (sources.length !== project.files.length) return "changed";
  for (const file of project.files) {
    const disk = sources.find((current) => current.path === file.path);
    if (!disk || (file.path !== project.entry && disk.revision !== file.sha256))
      return "changed";
  }
  return "current";
}
