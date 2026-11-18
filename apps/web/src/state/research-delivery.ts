import type { PlatformAction } from "../api/platform";
import type { ResearchRun } from "../api/research-runs";

export function researchDeliveries(actions: PlatformAction[]) {
  const ids = new Set<string>();
  for (const action of [...actions].sort((a, b) => a.seq - b.seq)) {
    const id = action.result?.research_run?.id;
    if (
      action.status !== "completed" ||
      action.origin === "ui" ||
      !id ||
      !["research.propose", "research.present"].includes(action.operation) ||
      !/^invsqrt-[a-f0-9]{32}$/.test(id)
    )
      continue;
    ids.delete(id);
    ids.add(id);
  }
  return [...ids];
}

export function researchDelivery(run: ResearchRun) {
  const candidate = run.comparison.columns.indexOf("Candidate");
  const baseline = run.comparison.columns.indexOf("Baseline");
  const metric = (label: string, index: number) =>
    run.comparison.rows.find((row) => row.label === label)?.values[index];
  const cost = metric("Resource cost · lower is better", candidate);
  const baselineCost = metric("Resource cost · lower is better", baseline);
  const passed =
    /^[a-f0-9]{64}$/.test(run.source_sha256 || "") &&
    run.status === "completed" &&
    baseline >= 0 &&
    candidate >= 0 &&
    metric("Validation", baseline) === "PASS" &&
    metric("Validation", candidate) === "PASS";
  const delta =
    passed &&
    typeof cost === "number" &&
    Number.isFinite(cost) &&
    typeof baselineCost === "number" &&
    Number.isFinite(baselineCost)
      ? cost - baselineCost
      : null;
  const labels: Record<string, string> = {
    review: "Candidate ready for review",
    running: "Verifying reviewed candidate",
    failed: "Verification failed",
    interrupted: "Verification interrupted",
    rejected: "Candidate rejected",
  };
  return {
    passed,
    cost,
    baselineCost,
    delta,
    label: passed
      ? delta === null
        ? "Saved verification passed"
        : delta < 0
          ? "Verified · lower resource cost"
          : delta === 0
            ? "Verified · unchanged resource cost"
            : "Verified · higher resource cost"
      : labels[run.status] || "Verification unavailable",
  };
}

export function continueResearchPrompt(run: ResearchRun, goal: string) {
  if (!/^[a-f0-9]{64}$/.test(run.source_sha256 || ""))
    throw Error(
      "Saved code version is unavailable. Reload the research record first.",
    );
  if (
    !/^invsqrt-[a-f0-9]{32}$/.test(run.id) ||
    !["completed", "failed", "interrupted", "rejected"].includes(run.status)
  )
    throw Error("Wait for a saved terminal research record before continuing.");
  return [
    "Continue this quantum research iteration. Prepare a new reviewable patch; do not verify or adopt automatically.",
    "Research goal: " + goal.slice(0, 700),
    "Inspect the saved source of " +
      run.id +
      " before editing; expected code SHA-256 " +
      run.source_sha256 +
      ".",
    "Inspect the current project baseline and revision again. Compare the next candidate with that baseline and preserve historical comparisons, failures and all browser drafts.",
    run.error
      ? "Prior verification failed: " + run.error.slice(0, 700)
      : "The preceding verification result is saved in this run; use actual reports, not estimates.",
  ].join("\n");
}
