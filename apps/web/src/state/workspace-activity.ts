import type { PlatformAction } from "../api/platform.ts";

/** De-emphasize only confirmed page changes, never failed or substantive work. */
export function workspaceActivityGroups(actions: PlatformAction[]) {
  const navigation: PlatformAction[] = [],
    primary: PlatformAction[] = [];
  for (const action of actions) {
    const result = action.result;
    const pageOnly =
      action.operation === "focus" &&
      action.status === "completed" &&
      !action.error &&
      !!result?.page &&
      !result.file &&
      !result.program &&
      !result.job &&
      !result.python_run &&
      !result.comparison;
    (pageOnly ? navigation : primary).push(action);
  }
  const cutoff = Math.max(0, primary.length - 8);
  return {
    navigation,
    recent: primary.filter(
      (action, index) =>
        index >= cutoff || action.status !== "completed" || !!action.error,
    ),
    earlier: primary.filter(
      (action, index) =>
        index < cutoff && action.status === "completed" && !action.error,
    ),
  };
}

export function workspacePageLabel(page: string | undefined) {
  const labels: Record<string, string> = {
    model: "Model",
    synthesis: "Compiler",
    program: "Quantum",
    execution: "Execution",
    jobs: "Results",
  };
  return (page && labels[page]) || "Workbench";
}
