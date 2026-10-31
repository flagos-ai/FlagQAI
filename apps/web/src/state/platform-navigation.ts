import type { PlatformAction } from "../api/platform";
import type {
  ExperimentImport,
  QuantumJob,
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";

type Readers = {
  experiment: (id: string) => Promise<ExperimentImport>;
  job: (id: string) => Promise<QuantumJob>;
};
// Resolve referenced resources before selecting them. Focus can arrive before
// Python's background collection has imported the corresponding archive.
export async function platformNavigation(
  action: PlatformAction,
  state: WorkspaceState,
  readers: Readers,
): Promise<WorkspaceAction[]> {
  const result = action.result;
  if (!result) return [];
  const changes: WorkspaceAction[] = [];
  if (result.file && action.operation === "model.create")
    changes.push({
      type: "open-agent-model",
      model: {
        name: result.name || "Agent model",
        source: result.file.source,
        language: result.file.id.endsWith(".py") ? "python" : "qasm",
      },
      file: result.file,
    });
  if (result.python_run)
    changes.push(
      { type: "python-run", id: result.python_run.id },
      { type: "language", language: "python" },
      { type: "navigate", page: "model" },
    );
  if (result.program)
    changes.push(
      { type: "import-agent-program", program: result.program },
      { type: "program", id: result.program.id },
      { type: "navigate", page: "program" },
    );
  if (result.job)
    changes.push(
      { type: "merge-jobs", jobs: [await readers.job(result.job.id)] },
      { type: "job", id: result.job.id },
      { type: "navigate", page: "jobs" },
    );
  if (result.page) {
    const ids = new Set(
      [result.program_id, result.job_id].filter((id): id is string => !!id),
    );
    for (const id of ids) {
      const missingProgram =
        result.program_id === id &&
        !state.programs.some((program) => program.id === id);
      const missingJob =
        result.job_id === id && !state.jobs.some((job) => job.id === id);
      if (!missingProgram && !missingJob) continue;
      if (id.startsWith("fqx-")) {
        const record = await readers.experiment(id);
        if (record.program.id !== id || (missingJob && record.job?.id !== id))
          throw Error(
            "The requested saved experiment does not contain the navigation target.",
          );
        changes.push({ type: "import-experiment", record });
      } else if (missingJob)
        changes.push({ type: "merge-jobs", jobs: [await readers.job(id)] });
      else
        throw Error(
          "The requested circuit is not loaded. Open its workbench action before navigating.",
        );
    }
    if (result.program_id)
      changes.push({ type: "program", id: result.program_id });
    if (result.job_id) changes.push({ type: "job", id: result.job_id });
    changes.push({
      type: "navigate",
      page: result.page as WorkspaceState["page"],
    });
  }
  changes.push({ type: "agent", open: true });
  return changes;
}
