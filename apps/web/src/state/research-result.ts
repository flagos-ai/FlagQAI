import type {
  ExperimentImport,
  ResearchResult,
} from "../contracts/quantum-workspace";

export function savedResearchResult(
  record?: ExperimentImport,
): ResearchResult | undefined {
  const info = record?.program.experiment;
  const origin = record?.program.origin;
  const result = info?.research_result;
  if (
    !result ||
    result.schema !== "flagqai.research-result.v1" ||
    result.binding?.archive_sha256 !== info?.sha256 ||
    result.binding?.program_hash !== info?.program_hash ||
    result.binding?.source_sha256 !== origin?.source_hash ||
    result.binding?.run_id !== origin?.run_id ||
    info?.python_run?.source_hash !== origin?.source_hash ||
    info?.python_run?.id !== origin?.run_id
  )
    return undefined;
  return result;
}

export function researchComparison(a?: ResearchResult, b?: ResearchResult) {
  if (!a || !b)
    return {
      warning:
        "Research metrics are unavailable for one or both saved experiments.",
      metrics: [],
      resources: [],
    };
  const warning =
    a.problem.sha256 !== b.problem.sha256 || a.method !== b.method
      ? "Different research problems or metric methods. Values are shown independently; no improvement is inferred."
      : a.execution_status !== "completed" || b.execution_status !== "completed"
        ? "A result came from an incomplete or failed execution. Keep it as evidence; it is not a verified improvement."
        : null;
  const metrics = a.metrics.flatMap((left) => {
    const right = b.metrics.find((m) => m.key === left.key);
    if (!right) return [];
    const compatible =
      !warning &&
      left.unit === right.unit &&
      left.method === right.method &&
      left.direction === right.direction;
    const delta = compatible ? right.value - left.value : null;
    return [
      {
        left,
        right,
        delta,
        relative:
          delta !== null && left.value !== 0
            ? delta / Math.abs(left.value)
            : null,
        improvement:
          delta === null
            ? null
            : delta * (left.direction === "minimize" ? -1 : 1),
      },
    ];
  });
  const resources = a.resources.flatMap((left) => {
    const right = b.resources.find((r) => r.key === left.key);
    return right
      ? [
          {
            left,
            right,
            delta:
              left.unit === right.unit &&
              left.scope === right.scope &&
              left.scope !== "whole Python run"
                ? right.value - left.value
                : null,
          },
        ]
      : [];
  });
  return { warning, metrics, resources };
}
export function researchNumber(value: number, signed = false) {
  if (!Number.isFinite(value)) return "—";
  const shown = value === 0 ? "0" : Number(value.toPrecision(6)).toString();
  return (signed && value > 0 ? "+" : "") + shown;
}
