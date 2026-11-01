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

/** Present only the selected, confirmed run; never flash a prior run as Ready. */
export function pythonRunFeedback({
  selectedId,
  run,
  submitting = false,
  stopping = false,
  error = "",
}: {
  selectedId?: string | null;
  run?: PythonRun;
  submitting?: boolean;
  stopping?: boolean;
  error?: string;
}) {
  if (submitting)
    return {
      label: "Starting…",
      busy: true,
      message: "Submitting this code. You can keep editing.",
    };
  if (selectedId && run?.id !== selectedId)
    return error
      ? {
          label: "Output unavailable",
          busy: false,
          message:
            "Cannot load this run yet. Choose another from history or retry loading; your code is unchanged.",
        }
      : {
          label: "Loading run…",
          busy: true,
          message: "Loading the selected run. Your current code is unchanged.",
        };
  if (!run)
    return {
      label: "Ready",
      busy: false,
      message: "Run Python to see output and saved results here.",
    };
  if (stopping && ["running", "queued"].includes(run.status))
    return {
      label: "Stopping…",
      busy: true,
      message: "Stop requested. Waiting for the Python service to confirm.",
    };
  if (run.status === "queued")
    return {
      label: "Queued",
      busy: true,
      message: "Waiting for the Python runner. You can keep editing.",
    };
  if (run.status === "running")
    return {
      label: "Running…",
      busy: true,
      message: "Running the submitted code. You can keep editing.",
    };
  if (run.status === "cancelled")
    return {
      label: "Stopped",
      busy: false,
      message: "Run stopped. Your code is unchanged.",
    };
  if (run.status === "timed_out")
    return {
      label: "Timed out",
      busy: false,
      message: "This run reached its time limit. Your code is unchanged.",
    };
  if (run.status === "failed")
    return {
      label: "Failed",
      busy: false,
      message:
        "This run failed. Review the error details or ask Agent for help.",
    };
  if (["pending", "collecting"].includes(run.collection_status || ""))
    return {
      label: "Collecting results…",
      busy: true,
      message: "Python finished. Opening the saved experiments…",
    };
  if (["partial", "failed"].includes(run.collection_status || ""))
    return {
      label: "Results need attention",
      busy: false,
      message: "Python finished, but some saved results could not be opened.",
    };
  return {
    label: "Completed",
    busy: false,
    message: "Finished without console output.",
  };
}
