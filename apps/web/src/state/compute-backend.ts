export type ComputeHealth = {
  backend: string;
  transport: string;
  mode?: string;
  max_qubits?: number;
  max_shots?: number;
  note?: string;
};

export function isComputeHealth(value: unknown): value is ComputeHealth {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ComputeHealth>;
  return (
    typeof data.backend === "string" &&
    !!data.backend.trim() &&
    typeof data.transport === "string" &&
    !!data.transport.trim()
  );
}

export function computeBackendName(info: ComputeHealth) {
  return info.backend === "flagquantum_pytorch_cpu"
    ? "PyTorch CPU"
    : info.backend === "test-only"
      ? "Scripted compute fixture"
      : info.backend;
}

export function computeBackendLabel(info: ComputeHealth) {
  return `${computeBackendName(info)} · ${info.transport}`;
}

export function reportedLimit(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value.toLocaleString()
    : "Not reported";
}
