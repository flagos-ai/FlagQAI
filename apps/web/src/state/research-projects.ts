import type { ResearchRunSummary } from "../api/research-runs";

// These records belong to the service workspace, not the open local folder.
export function researchProjects(runs: ResearchRunSummary[]) {
  const projects = new Map<
    string,
    { id: string; name: string; count: number; latest: ResearchRunSummary }
  >();
  for (const run of [...runs].sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id),
  )) {
    if (!/^invsqrt-[a-f0-9]{32}$/.test(run.id) || !run.project.id) continue;
    const project = projects.get(run.project.id);
    if (project) project.count++;
    else
      projects.set(run.project.id, { ...run.project, count: 1, latest: run });
  }
  return [...projects.values()];
}
