import type { QuantumJob } from "../contracts/quantum-workspace";

export const jobActive = (job: QuantumJob) =>
  job.status === "queued" || job.status === "running";
export const jobStatus = (job: QuantumJob) =>
  job.status === "completed"
    ? job.experiment
      ? "Saved result"
      : "Completed"
    : job.status === "running"
      ? "Running"
      : job.status === "queued"
        ? "Queued"
        : "Failed";

export function jobCounts(job: QuantumJob, measurement = 0, batch = 0) {
  if (!job.experiment) return job.result?.counts || {};
  const counts: Record<string, number> = {};
  for (const row of job.experiment.measurements[measurement]?.batches?.[
    batch
  ] || []) {
    const key =
      row.key_type === "integer" ? `${row.state} (integer)` : row.state;
    counts[key] = (counts[key] || 0) + row.count;
  }
  return counts;
}

export function distributionRows(
  counts: Record<string, number>,
  sort: "probability" | "state",
) {
  return Object.entries(counts).sort((a, b) =>
    sort === "probability"
      ? b[1] - a[1] || a[0].localeCompare(b[0])
      : a[0].localeCompare(b[0], undefined, { numeric: true }),
  );
}

export function jobGroups(
  jobs: QuantumJob[],
  query: string,
  status: string,
  now = new Date(),
) {
  const groups = new Map<string, QuantumJob[]>();
  for (const job of jobs
    .filter(
      (item) =>
        (status === "all" || item.status === status) &&
        `${item.name} ${item.id} ${item.experiment?.filename || ""}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
    )
    .sort(
      (a, b) =>
        Number(jobActive(b)) - Number(jobActive(a)) ||
        (b.experiment?.imported_at || 0) - (a.experiment?.imported_at || 0),
    )) {
    const date = job.experiment?.imported_at;
    const label = jobActive(job)
      ? "In progress"
      : date
        ? new Date(date).toDateString() === now.toDateString()
          ? "Added today"
          : new Date(date).toLocaleDateString()
        : "Other runs";
    groups.set(label, [...(groups.get(label) || []), job]);
  }
  return [...groups.entries()];
}
