import type { QuantumJob } from "../contracts/quantum-workspace";
export type JobView = {
  counts: boolean;
  view: "chart" | "table";
  sort: "probability" | "state";
  page: number;
  measurement: number;
  batch: number;
};
const key = "fq-job-views-v1";
export const defaultJobView: JobView = {
  counts: false,
  view: "chart",
  sort: "probability",
  page: 0,
  measurement: 0,
  batch: 0,
};
const index = (value: unknown, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, Math.max(0, max))
    : 0;
export function normalizeJobView(
  value: Partial<JobView> | null | undefined,
  job: QuantumJob,
): JobView {
  const measurements = job.experiment?.measurements || [];
  const measurement = index(value?.measurement, measurements.length - 1);
  const batch = index(
    value?.batch,
    (measurements[measurement]?.batches?.length || 0) - 1,
  );
  const count = job.experiment
    ? measurements[measurement]?.batches?.[batch]?.length || 0
    : Object.keys(job.result?.counts || {}).length;
  return {
    counts: value?.counts === true,
    view: value?.view === "table" ? "table" : "chart",
    sort: value?.sort === "state" ? "state" : "probability",
    measurement,
    batch,
    page: index(value?.page, Math.ceil(count / 32) - 1),
  };
}
function readViews(storage: Pick<Storage, "getItem">): Record<string, JobView> {
  const value = JSON.parse(storage.getItem(key) || "{}");
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
export function readJobView(
  storage: Pick<Storage, "getItem">,
  job: QuantumJob,
) {
  try {
    return normalizeJobView(readViews(storage)[job.id], job);
  } catch {
    return { ...defaultJobView };
  }
}
export function writeJobView(
  storage: Pick<Storage, "getItem" | "setItem">,
  job: QuantumJob,
  view: JobView,
) {
  try {
    let previous: Record<string, JobView> = {};
    try {
      previous = readViews(storage);
    } catch {
      /* Invalid view preferences never replace a draft. */
    }
    const entries = Object.entries(previous)
      .filter(([id]) => id !== job.id)
      .slice(-63);
    storage.setItem(
      key,
      JSON.stringify(
        Object.fromEntries([...entries, [job.id, normalizeJobView(view, job)]]),
      ),
    );
  } catch {
    /* Presentation preferences are optional; all results remain server-owned. */
  }
}
