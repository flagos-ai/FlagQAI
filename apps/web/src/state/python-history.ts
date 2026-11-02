import type { PythonRun } from "../api/python-runs.ts";
const runTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
export function pythonRunTime(seconds?: number) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)
    return undefined;
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) return undefined;
  return runTimeFormat.format(date);
}
export function pythonHistoryLabel(
  run: Pick<PythonRun, "id" | "name" | "status" | "created_at">,
) {
  return [
    run.name,
    pythonRunTime(run.created_at),
    run.status.replaceAll("_", " "),
    run.id.slice(0, 8),
  ]
    .filter(Boolean)
    .join(" · ");
}
