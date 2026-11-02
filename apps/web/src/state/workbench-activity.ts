// Presentation only: native events and raw results remain unchanged.
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const short = (value: unknown) => text(value).slice(0, 12);

const labels: Record<string, string> = {
  workbench_create_python: "Create model",
  workbench_run_python: "Run Python",
  workbench_wait_run: "Wait for result",
  workbench_inspect: "Inspect",
  workbench_present_experiment: "Verify experiment",
  workbench_compare_experiments: "Compare results",
};
export function workbenchActivity(
  name: string,
  args: Record<string, unknown>,
  output: string,
  failed: boolean,
) {
  const label = labels[name];
  if (!label) return undefined;
  let result: Record<string, unknown> = {};
  try {
    if (output.length <= 128000) result = object(JSON.parse(output));
  } catch {
    /* Streamed output is not complete JSON yet. */
  }
  const detail =
    text(args.name) ||
    text(args.resource) ||
    text(args.view) ||
    short(args.run_id || args.model_id || args.experiment_id || args.id);
  const base = {
    label,
    detail,
    runningLabel: name === "workbench_wait_run" ? "Waiting" : "Working",
    status: "Checked",
    tone: "neutral",
    runId: undefined as string | undefined,
    body: "Output available. Expand Raw result for the original data.",
  };
  if (failed)
    return {
      ...base,
      status: "Failed",
      tone: "error",
      body:
        output.length <= 4000
          ? output
          : output.slice(0, 4000) + "\nFull error available under Raw result.",
    };
  if (!output.trim()) return { ...base, status: "Pending", body: "" };
  const isRun =
    name === "workbench_run_python" ||
    name === "workbench_wait_run" ||
    (name === "workbench_inspect" && args.resource === "run");
  if (isRun) {
    const run =
      name === "workbench_run_python" ? object(result.python_run) : result;
    const status = text(run.status),
      collection = text(run.collection_status);
    const identity = [text(run.name), short(run.id)]
      .filter(Boolean)
      .join(" · ");
    const lines = [identity || "Python run"];
    let state = "Status unavailable",
      tone = "attention";
    if (
      status === "failed" ||
      status === "timed_out" ||
      status === "cancelled"
    ) {
      state =
        status === "failed"
          ? "Run failed"
          : status === "timed_out"
            ? "Timed out"
            : "Stopped";
      tone = status === "cancelled" ? "neutral" : "error";
      const logs = Array.isArray(run.logs) ? run.logs : [];
      const error =
        text(run.error) ||
        logs
          .filter((item) => object(item).stream === "stderr")
          .map((item) => text(object(item).text))
          .join("\n");
      lines.push(state);
      if (error)
        lines.push(error.trim().split("\n").slice(-4).join("\n").slice(-1000));
      lines.push("Open Python output for this run's full error and source.");
    } else if (status === "queued" || status === "running") {
      state =
        status === "queued"
          ? "Queued"
          : name === "workbench_run_python"
            ? "Started"
            : "Still running";
      tone = "neutral";
      lines.push(
        result.wait_outcome === "deadline"
          ? "Wait ended; the existing run continues. It was not submitted again."
          : state,
      );
    } else if (status === "completed") {
      const errors = Array.isArray(run.collection_errors)
        ? run.collection_errors
        : [];
      if (collection === "pending" || collection === "collecting") {
        state = "Collecting results";
        tone = "neutral";
        lines.push(
          "Python finished; saved artifacts are still being collected.",
        );
      } else if (collection !== "completed" || errors.length) {
        state = "Results need attention";
        lines.push("Python finished; saved artifacts need attention.");
        const message = text(object(errors[0]).message);
        if (message) lines.push(message.slice(0, 800));
      } else {
        const experiments = Array.isArray(run.experiments)
          ? run.experiments
          : [];
        const recorded = experiments.filter(
          (item) => object(item).has_result === true,
        ).length;
        const circuitOnly =
          experiments.length > 0 &&
          experiments.every((item) => object(item).has_result === false);
        state = experiments.length
          ? recorded
            ? "Results ready"
            : circuitOnly
              ? "Circuit ready"
              : "Experiments ready"
          : "No saved experiment";
        tone = experiments.length ? "neutral" : "attention";
        lines.push(
          experiments.length
            ? `${experiments.length} saved ${experiments.length === 1 ? "experiment" : "experiments"}${recorded ? ` · ${recorded} with recorded results` : circuitOnly ? " · circuit only" : ""}.`
            : "Python finished without a saved .fqx experiment. Check the code and Python output.",
        );
      }
    } else
      lines.push(
        "No authoritative run status was returned. Inspect the existing run before retrying.",
      );
    if (text(run.source_hash)) lines.push("Source · " + short(run.source_hash));
    return {
      ...base,
      detail: identity || detail,
      status: state,
      tone,
      runId: text(run.id) || undefined,
      body: lines.join("\n"),
    };
  }
  if (name === "workbench_create_python") {
    const file = object(result.file);
    if (text(file.id))
      return {
        ...base,
        detail: text(result.name) || detail,
        status: "Created",
        body: `New Python model · ${text(result.name) || text(file.id)}\nRevision · ${short(file.revision)}`,
      };
  }
  const evidence =
    name === "workbench_present_experiment" ? object(result.evidence) : result;
  if (
    name === "workbench_present_experiment" ||
    (name === "workbench_inspect" && args.resource === "experiment")
  ) {
    const program = object(evidence.program);
    const archive = object(evidence.archive || program.experiment),
      circuit = object(evidence.circuit || program.compiled);
    const hasResult =
      typeof evidence.has_result === "boolean"
        ? evidence.has_result
        : typeof archive.has_result === "boolean"
          ? archive.has_result
          : "job" in evidence
            ? !!evidence.job
            : undefined;
    if (text(evidence.id)) {
      const lines = [
        text(archive.filename) ||
          text(evidence.name) ||
          text(program.name) ||
          text(evidence.id),
      ];
      const gates =
        typeof circuit.instruction_count === "number"
          ? circuit.instruction_count
          : Array.isArray(circuit.instructions)
            ? circuit.instructions.length
            : undefined;
      if (typeof circuit.qubits === "number")
        lines.push(
          `${circuit.qubits} ${circuit.qubits === 1 ? "qubit" : "qubits"} · ${gates === undefined ? "saved circuit" : `${gates} ${gates === 1 ? "gate" : "gates"}`}`,
        );
      lines.push(
        hasResult === true
          ? "Recorded result available."
          : hasResult === false
            ? "Circuit only · no saved measurement result."
            : "Saved result status unavailable.",
      );
      if (text(archive.sha256))
        lines.push("Archive · " + short(archive.sha256));
      if (name === "workbench_present_experiment")
        lines.push("Page changes follow your Follow Agent setting.");
      return {
        ...base,
        detail: text(archive.filename) || detail,
        status:
          hasResult === true
            ? "Result available"
            : hasResult === false
              ? "Circuit only"
              : "Status unavailable",
        tone: hasResult === undefined ? "attention" : "neutral",
        body: lines.join("\n"),
      };
    }
  }
  const comparison = object(result.comparison);
  if (
    name === "workbench_compare_experiments" &&
    text(comparison.left) &&
    text(comparison.right) &&
    comparison.left !== comparison.right
  )
    return {
      ...base,
      status: "Comparison ready",
      detail: "Two saved experiments",
      body: "Saved results selected for comparison.\nPage changes follow your Follow Agent setting.\nExpand Raw result for the original experiment IDs.",
    };
  if (name === "workbench_inspect") {
    if (args.resource === "workspace")
      return {
        ...base,
        status: "Read",
        body: [
          `Page · ${text(result.page) || "unavailable"}`,
          `Backend · ${text(object(result.backend).transport) || "unavailable"}`,
          ...(result.dirty === true
            ? ["The editor has changes; preserve its draft."]
            : []),
        ].join("\n"),
      };
    if (args.resource === "model" || args.resource === "draft")
      return {
        ...base,
        status: "Read",
        body: `${text(result.name) || text(result.id) || "Source snapshot"}\nVersion · ${short(result.revision || result.source_hash) || "unavailable"}\nExpand Raw result to inspect the source.`,
      };
  }
  return base;
}
