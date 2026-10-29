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
export const quantumAPI = {
  health: () => request<{ transport: string; backend: string }>("/api/health"),
  compile: (source: string) =>
    request<CompiledProgram>("/api/compile", { source }),
  job: (id: string) =>
    request<QuantumJob>("/api/jobs/" + encodeURIComponent(id)),
  jobs: () => request<QuantumJob[]>("/api/jobs"),
  submit: (source: string, shots: number, seed: number, name: string) =>
    request<QuantumJob>("/api/jobs", { source, shots, seed, name }),
};
