export type ExecutionProfile = {
  target: "simulator";
  backend: "pytorch";
  method: string;
  device: string;
  scale: "single_device";
  precision: "complex64";
};
export type ExecutionCapabilities = {
  sdk_version: string;
  devices: {
    id: string;
    label: string;
    methods: {
      id: string;
      label: string;
      available: boolean;
      reason?: string;
    }[];
  }[];
  device_families?: {
    id: string;
    label: string;
    status: string;
    reason: string;
  }[];
  hardware: {
    available: boolean;
    reason: string;
    providers?: QPUProvider[];
  };
  scales: { id: string; label: string; available: boolean; reason?: string }[];
  other_workflows: { id: string; label: string; reason: string }[];
};
export type ExecutionSelection = {
  profile: ExecutionProfile;
  revision: number;
  environment_revision: number;
  stale: boolean;
  capabilities: ExecutionCapabilities | null;
};
export const defaultExecutionProfile: ExecutionProfile = {
  target: "simulator",
  backend: "pytorch",
  method: "statevector",
  device: "cpu",
  scale: "single_device",
  precision: "complex64",
};
export function executionMethodLabel(method: string) {
  return (
    (
      {
        statevector: "Statevector · SV",
        mps: "Matrix product state · MPS",
        tensor_network: "Tensor network · TN",
        density_matrix: "Density matrix",
        stabilizer: "Stabilizer",
      } as Record<string, string>
    )[method] || method
  );
}
export function executionSummary(profile: ExecutionProfile) {
  return `Simulator · ${executionMethodLabel(profile.method)} · ${profile.device}`;
}

export const executionDeviceFamilies = [
  { id: "cpu", label: "CPU" },
  { id: "cuda", label: "GPU · CUDA" },
  { id: "flagos", label: "AI chips (incl. domestic) · FlagOS / Torch-FL" },
];
export const separateExecutionWorkflows = [
  {
    id: "pauli_propagation",
    label: "Pauli propagation",
    reason: "Observable / expectation task · not connected to circuit sampling",
  },
  {
    id: "dynamics",
    label: "Dynamics",
    reason: "Time-evolution task · not connected to circuit sampling",
  },
];
export function executionDeviceChoices(
  report: ExecutionCapabilities | null | undefined,
  selected: string,
) {
  const detected =
    report?.devices.map((device) => ({
      id: device.id,
      label: `${device.label} · ${device.id}`,
      disabled: !device.methods.some((method) => method.available),
    })) || [];
  const missing = executionDeviceFamilies
    .filter(
      (family) =>
        !detected.some((device) => device.id.split(":")[0] === family.id),
    )
    .map((family) => {
      const status = report?.device_families?.find(
        (value) => value.id === family.id,
      )?.status;
      const suffix = !report
        ? "not checked"
        : status === "dependency_missing"
          ? "runtime not installed"
          : status === "not_activated"
            ? "provider not activated"
            : "not detected";
      return {
        id: family.id === "cpu" ? "cpu" : `${family.id}:0`,
        label: `${family.label} · ${suffix}`,
        disabled: true,
      };
    });
  const rows = [...detected, ...missing];
  if (!rows.some((row) => row.id === selected))
    rows.unshift({
      id: selected,
      label: `${selected} · not checked`,
      disabled: true,
    });
  return rows;
}

export type QPUProvider = {
  id: string;
  label: string;
  adapter_status: "module_present" | "not_found" | "not_checked";
  connection_status: "not_connected";
  devices: never[];
};
// Catalog browsing never activates a profile or makes a provider request.
export function qpuProviderChoices(
  report?: ExecutionCapabilities | null,
): QPUProvider[] {
  return (
    report?.hardware.providers?.map((provider) =>
      provider.id === "quafu" ? { ...provider, label: "QUAFU" } : provider,
    ) ??
    [
      { id: "quafu", label: "QUAFU" },
      { id: "braket", label: "Amazon Braket" },
      { id: "azure", label: "Azure Quantum" },
      { id: "http", label: "Custom quantum service · HTTP" },
    ].map((provider) => ({
      ...provider,
      adapter_status: "not_checked",
      connection_status: "not_connected",
      devices: [],
    }))
  );
}
