import type { ExperimentImport } from "../contracts/quantum-workspace";

export const MAX_EXPERIMENT_BYTES = 16 * 1024 * 1024;
export async function importExperiment(file: File): Promise<ExperimentImport> {
  if (
    !file.name.toLowerCase().endsWith(".fqx") ||
    file.size === 0 ||
    file.size > MAX_EXPERIMENT_BYTES
  )
    throw Error("Select a .fqx experiment no larger than 16 MiB.");
  const response = await fetch(
    "/api/experiments?name=" + encodeURIComponent(file.name),
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    },
  );
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Cannot import experiment.");
  return body;
}
export async function listExperiments(): Promise<ExperimentImport[]> {
  const response = await fetch("/api/experiments", { cache: "no-store" });
  if (!response.ok) throw Error("Cannot read imported experiments.");
  return response.json();
}
export const experimentFileURL = (id: string) =>
  "/api/experiments/" + encodeURIComponent(id) + "/file";

export async function readExperiment(
  id: string,
  signal?: AbortSignal,
): Promise<ExperimentImport> {
  const response = await fetch("/api/experiments/" + encodeURIComponent(id), {
    signal,
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Cannot read saved experiment.");
  return body;
}
