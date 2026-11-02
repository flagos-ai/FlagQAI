import type { PythonRun } from "../api/python-runs.ts";

/** Copy the displayed console snapshot without UI labels or stream reordering. */
export function pythonOutputText(
  run?: Pick<PythonRun, "logs" | "truncated" | "error">,
) {
  if (!run) return "";
  return (
    run.logs.map((log) => log.text).join("") +
    (run.truncated ? "\nOutput truncated at 64 KiB." : "") +
    (run.error ? "\n" + run.error : "")
  );
}
