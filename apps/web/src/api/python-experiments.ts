import type { PythonRun } from "./python-runs";
import { readExperiment } from "./experiments.ts";
import { matchesPythonExperiment } from "../state/python-workspace.ts";

// One broken preview must not prevent other files from reaching the workbench.
export async function loadPythonExperiments(
  run: PythonRun,
  read = readExperiment,
  signal?: AbortSignal,
) {
  return Promise.all(
    (run.experiments || []).map(async (reference) => {
      try {
        const record = await read(reference.id, signal);
        if (!matchesPythonExperiment(run, reference, record))
          throw Error(
            "Saved experiment does not match this Python source snapshot.",
          );
        return { id: reference.id, record, error: undefined };
      } catch (problem) {
        return {
          id: reference.id,
          record: undefined,
          error:
            problem instanceof Error
              ? problem.message
              : "Cannot load experiment preview.",
        };
      }
    }),
  );
}
