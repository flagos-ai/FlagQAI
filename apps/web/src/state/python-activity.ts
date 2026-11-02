import type { PythonRun } from "../api/python-runs.ts";
import { pythonRunFeedback } from "./python-feedback.ts";

// Process completion and artifact collection are separate lifecycle stages.
export function pythonActivityUpdating(run: PythonRun) {
  return (
    ["queued", "running"].includes(run.status) ||
    (run.status === "completed" &&
      ["pending", "collecting"].includes(run.collection_status || ""))
  );
}

export function pythonActivityFeedback(run: PythonRun) {
  const feedback = pythonRunFeedback({ selectedId: run.id, run });
  if (run.status !== "completed" || feedback.busy) return feedback;
  if (
    run.collection_errors?.length ||
    ["partial", "failed", "cancelled"].includes(run.collection_status || "")
  )
    return {
      label: "Results need attention",
      busy: false,
      message: "Python finished; inspect the saved-output details.",
    };
  if (run.collection_status !== "completed")
    return {
      label: "Python finished",
      busy: false,
      message: "Saved-output status is unavailable. Inspect Python output.",
    };
  const references = run.experiments || [];
  if (references.some((item) => item.has_result) || run.artifact?.job)
    return {
      label: "Results ready",
      busy: false,
      message: "Saved circuit and recorded results are available.",
    };
  if (references.length || run.artifact)
    return {
      label: "Circuit ready",
      busy: false,
      message: "Saved circuit available; no recorded result.",
    };
  return {
    label: "No saved experiment",
    busy: false,
    message: "Python finished without a saved .fqx experiment.",
  };
}
