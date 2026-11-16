import type { ComputeHealth } from "../state/compute-backend";
import type {
  CompiledProgram,
  QuantumJob,
} from "../contracts/quantum-workspace";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("The local computation service returned an invalid response.");
  }
  if (!response.ok) throw Error(result.error || "Computation request failed.");
  return result;
}
export type ComputeConfig = {
  transport: "local" | "ssh";
  local_python: string;
  remote_python: string;
  ssh_target: string;
  ssh_port: number;
  ssh_identity?: string;
};
export type ComputeSelection = { config: ComputeConfig; revision: number };
export const quantumAPI = {
  computeEnvironment: () =>
    request<ComputeSelection>("/api/compute-environment"),
  checkComputeEnvironment: (config: ComputeConfig) =>
    request<{
      check_id: string;
      runtime: {
        python: string;
        sdk_version?: string;
        pytorch?: string;
        synth_supported?: boolean;
      };
    }>("/api/compute-environment/check", config),
  activateComputeEnvironment: (data: {
    config: ComputeConfig;
    expected_revision: number;
    check_id: string;
  }) => request<ComputeSelection>("/api/compute-environment/activate", data),
  health: () => request<ComputeHealth>("/api/health"),
  compile: (source: string) =>
    request<CompiledProgram>("/api/compile", { source }),
  job: (id: string) =>
    request<QuantumJob>("/api/jobs/" + encodeURIComponent(id)),
  jobs: () => request<QuantumJob[]>("/api/jobs"),
  submit: (source: string, shots: number, seed: number, name: string) =>
    request<QuantumJob>("/api/jobs", { source, shots, seed, name }),
};
