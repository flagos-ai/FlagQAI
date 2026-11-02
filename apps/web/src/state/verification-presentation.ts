import type { Verification } from "../api/reproduction";
import type { ArchivedVerification } from "../api/research-packages";
const labels: Record<Verification["status"], string> = {
  blocked: "Environment needs preparation",
  prepared: "Environment checked · ready for explicit reproduction",
  submitting: "Submission receipt pending · do not resubmit",
  verifying: "Reproducing · collecting and checking results",
  submission_unknown: "Submission uncertain · inspect run history",
  exact: "Verified · exact match",
  tolerance: "Verified · within numeric tolerance",
  different: "Results differ",
  incomplete: "Verification incomplete",
  failed: "Reproduction failed",
};
export function verificationLabel(record: Verification, archived = false) {
  if (archived && record.status === "prepared")
    return "Archived environment check · no execution recorded";
  return (
    (archived ? "Archived verification · " : "Current environment · ") +
    labels[record.status]
  );
}
export function verificationSummary(
  current: Verification[],
  archived: ArchivedVerification[],
  run: string,
  source: string,
) {
  const local = current
    .filter((r) => r.original_run === run && r.source_hash === source)
    .sort((a, b) => b.created_at - a.created_at);
  const history = archived
    .filter(
      (r) => r.report.original_run === run && r.report.source_hash === source,
    )
    .sort((a, b) => b.report.created_at - a.report.created_at);
  const passing = (s: string) => s === "exact" || s === "tolerance";
  return {
    local,
    history,
    currentPassed: local.filter((r) => passing(r.status)).length,
    archivedPassed: history.filter((r) => passing(r.validated_status)).length,
    latest: local[0],
    warnings: [
      ...new Set([
        ...(local[0]
          ? [
              ...local[0].differences,
              ...(local[0].preparation?.blockers || []),
              ...(local[0].preparation?.notes || []),
            ]
          : []),
        ...(history[0]?.report.differences || []).map(
          (note) => "Archived report: " + note,
        ),
      ]),
    ],
  };
}
