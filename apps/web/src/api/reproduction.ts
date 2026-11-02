import type { PythonRun } from "./python-runs";
export type Verification = {
  id: string;
  status:
    | "blocked"
    | "prepared"
    | "submitting"
    | "verifying"
    | "submission_unknown"
    | "exact"
    | "tolerance"
    | "different"
    | "incomplete"
    | "failed";
  package_id?: string;
  original_run: string;
  source_hash: string;
  created_at: number;
  run_id?: string;
  configured_environment: PythonRun["environment"];
  runtime: {
    python?: string;
    sdk_version?: string;
    pytorch?: string;
    cuda_available?: boolean;
  };
  reproduced_runtime?: PythonRun["runtime"];
  producer_versions: string[];
  recorded_execution?: {
    filename: string;
    backend?: string;
    device?: string;
    precision?: string;
    measurements: { shots?: number; seed?: number }[];
  }[];
  preparation?: {
    schema: string;
    archived: Record<string, unknown> | null;
    current: Record<string, unknown>;
    dependencies: {
      name: string;
      recorded?: string | null;
      current?: string | null;
      state: string;
    }[];
    referenced_imports: string[];
    unresolved_imports: string[];
    blockers: string[];
    notes: string[];
    commands: string;
    installation_performed: boolean;
    complete_historical_lock: boolean;
  };
  differences: string[];
  notice: string;
  error?: string;
  tolerance?: { absolute: number; relative: number };
  artifacts?: {
    filename: string;
    status: string;
    circuit: string;
    counts: string;
    measurements: string;
    original_archive: { id: string; sha256: string };
    reproduced_archive: { id: string; sha256: string };
    original_metrics?: {
      expected_cut: number;
      optimal_sample_rate: number;
    } | null;
    reproduced_metrics?: {
      expected_cut: number;
      optimal_sample_rate: number;
    } | null;
  }[];
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/reproduction/" + path, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(value.error || "Reproduction verification is unavailable.");
  return value;
}
export const reproductionAPI = {
  check: (run_id: string, package_id?: string) =>
    request<Verification>("check", { run_id, package_id }),
  list: (run_id: string, package_id?: string) =>
    request<Verification[]>("list", { run_id, package_id }),
  start: (id: string) => request<Verification>("start", { id }),
  read: (id: string) => request<Verification>(encodeURIComponent(id)),
};
