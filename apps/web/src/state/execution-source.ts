import type { WorkspaceState } from "../contracts/quantum-workspace";

export function executionSourceBlockedReason(
  state: Pick<WorkspaceState, "execution" | "language">,
) {
  return !state.execution && state.language === "python"
    ? "Choose a saved circuit to run here, or use Run Python in Model for the current draft."
    : "";
}
