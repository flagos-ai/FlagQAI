import type { PythonRun } from "../api/python-runs";
import type { WorkspaceState } from "../contracts/quantum-workspace";
import { pythonResultFreshness } from "./python-feedback.ts";

// Names provide related history, never proof that a circuit matches new code.
export function compilationResults(state: WorkspaceState, run?: PythonRun) {
  if (state.language === "python") {
    if (state.pythonRunId) {
      if (!run || run.id !== state.pythonRunId) return [];
      return state.programs.filter(
        (program) =>
          program.origin?.run_id === run.id &&
          program.origin.source === run.source &&
          (!run.source_hash ||
            program.origin.source_hash === run.source_hash) &&
          run.experiments?.some(
            (file) =>
              file.id === program.id &&
              file.sha256 === program.experiment?.sha256,
          ),
      );
    }
    return state.programs.filter(
      (program) =>
        program.origin?.language === "python" &&
        program.origin.source === state.source,
    );
  }
  return state.programs.filter(
    (program) =>
      program.origin?.language !== "python" &&
      (program.source === state.source || program.name === state.name),
  );
}

export function circuitMatchesSource(
  state: WorkspaceState,
  program: WorkspaceState["programs"][number],
) {
  return state.language === "python"
    ? program.origin?.language === "python" &&
        pythonResultFreshness(program.origin, state) === "current"
    : program.origin?.language !== "python" && program.source === state.source;
}
