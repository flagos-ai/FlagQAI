import type { PythonRun } from "../api/python-runs";

const executionIssue = (run: PythonRun) =>
  ["failed", "cancelled", "timed_out"].includes(run.status);
const collectionIssue = (run: PythonRun) =>
  ["partial", "failed", "cancelled"].includes(run.collection_status || "") ||
  !!run.collection_errors?.length;

// Runs are ordered by the turn's submission records, not HTTP response order.
// A later successful result can settle this task without erasing earlier errors.
export function experimentTaskStatus({
  runs,
  expectedRuns,
  active,
  outcome,
  unavailable,
  savedResults,
}: {
  runs: PythonRun[];
  expectedRuns: number;
  active: boolean;
  outcome?: string;
  unavailable: boolean;
  savedResults: number;
}) {
  const working = runs.some((run) =>
    ["queued", "running"].includes(run.status),
  );
  const collecting = runs.some(
    (run) =>
      ["queued", "running", "completed"].includes(run.status) &&
      ["pending", "collecting"].includes(run.collection_status || ""),
  );
  const incomplete =
    runs.length !== expectedRuns ||
    unavailable ||
    runs.some(
      (run) =>
        run.status === "completed" &&
        ![
          "pending",
          "collecting",
          "completed",
          "partial",
          "failed",
          "cancelled",
        ].includes(run.collection_status || ""),
    );
  const problems = runs.filter(
    (run) => executionIssue(run) || collectionIssue(run),
  );
  const latest = runs.at(-1);
  const latestReady =
    latest?.status === "completed" &&
    latest.collection_status === "completed" &&
    !collectionIssue(latest) &&
    (!!latest.experiments?.some((item) => item.has_result) ||
      !!latest.artifact?.job);
  const recovered =
    !active &&
    outcome === "completed" &&
    !working &&
    !collecting &&
    !incomplete &&
    latestReady &&
    savedResults > 0 &&
    problems.length > 0;
  const needsAttention = problems.length > 0 && !recovered;
  const settled =
    !active && !working && !collecting && !incomplete && !needsAttention;
  const label = working
    ? "Running experiment"
    : collecting
      ? "Collecting saved results"
      : incomplete
        ? "Checking run progress"
        : active
          ? "Agent working"
          : needsAttention
            ? "Run needs attention"
            : savedResults
              ? outcome === "completed"
                ? "Experiment ready"
                : "Results saved"
              : "No saved result yet";
  return {
    working,
    collecting,
    incomplete,
    recovered,
    needsAttention,
    settled,
    label,
    problems,
  };
}
