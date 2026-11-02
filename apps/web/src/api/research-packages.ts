import type { Verification } from "./reproduction";
import type { PythonRun } from "./python-runs";
import type { ExperimentImport } from "../contracts/quantum-workspace";
import type { ResearchTurn, ResearchAdoption } from "../state/research-record";
export type ArchivedVerification = {
  key: string;
  report: Verification;
  run?: PythonRun | null;
  validated_status: Verification["status"];
  comparison?: Pick<Verification, "status" | "artifacts" | "tolerance"> | null;
  evidence_scope: "archived";
  notice: string;
};
export type ResearchPackage = {
  id: string;
  name: string;
  imported_at: number;
  run_count: number;
  research: {
    root_run: string;
    root_source_sha256: string;
    goal: string;
    turns: ResearchTurn[];
    notices: string[];
    adopted: ResearchAdoption | null;
  };
  runs: Record<string, PythonRun>;
  experiments: Record<string, ExperimentImport>;
  local_ids: Record<string, string>;
  archived_verifications?: ArchivedVerification[];
};
export type ResearchPackageItem = Pick<
  ResearchPackage,
  "id" | "name" | "imported_at" | "run_count"
>;
async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "Research packages are unavailable.");
  return data;
}
export const researchPackages = {
  list: () => json<ResearchPackageItem[]>("/api/research"),
  read: (id: string) =>
    json<ResearchPackage>("/api/research/" + encodeURIComponent(id)),
  import: async (file: File) => {
    if (
      !file.name.toLowerCase().endsWith(".zip") ||
      !file.size ||
      file.size > 64 * 1024 * 1024
    )
      throw Error("Select a research ZIP no larger than 64 MiB.");
    return json<ResearchPackage>("/api/research/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/zip",
        "X-Filename": encodeURIComponent(file.name),
      },
      body: file,
    });
  },
  export: async (request: unknown) => {
    const response = await fetch("/api/research/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const data = await response.json();
      throw Error(data.error || "Cannot export research package.");
    }
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "qaoa-research.zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
