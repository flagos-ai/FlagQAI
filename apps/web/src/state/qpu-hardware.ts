import type { ExecutionCapabilities } from "./execution-profile";

export type HardwareVendor = {
  id: string;
  label: string;
  workload: string;
  adapterId?: string;
  accessChannel?: string;
};
export const qpuTechnologies: {
  id: string;
  label: string;
  vendors: HardwareVendor[];
}[] = [
  {
    id: "ion_trap",
    label: "Trapped ion",
    vendors: [
      { id: "ionq", label: "IonQ", workload: "Gate-based circuits" },
      {
        id: "quantinuum",
        label: "Quantinuum",
        workload: "Gate-based circuits",
      },
    ],
  },
  {
    id: "superconducting",
    label: "Superconducting",
    vendors: [
      {
        id: "quafu",
        label: "QUAFU · China",
        workload: "Gate-based circuits",
        adapterId: "quafu",
      },
      {
        id: "anyon",
        label: "Anyon Technologies / Anyon Computing",
        workload: "Gate-based circuits",
      },
      { id: "iqm", label: "IQM", workload: "Gate-based circuits" },
      { id: "oqc", label: "OQC", workload: "Gate-based circuits" },
      { id: "tii", label: "TII", workload: "Gate-based circuits" },
    ],
  },
  {
    id: "neutral_atom",
    label: "Neutral atom",
    vendors: [
      {
        id: "infleqtion",
        label: "Infleqtion",
        workload: "Device-specific gate / analog capabilities must be verified",
      },
      {
        id: "pasqal",
        label: "Pasqal",
        workload:
          "Device-specific analog / digital capabilities must be verified",
      },
      {
        id: "quera",
        label: "QuEra Computing",
        workload: "Device-specific analog / gate capabilities must be verified",
      },
    ],
  },
  {
    id: "photonic",
    label: "Photonic",
    vendors: [
      {
        id: "qboson",
        label: "QBOSON · China",
        accessChannel: "Kaiwu SDK",
        workload: "Coherent optical · Ising / QUBO optimization and sampling",
      },
      {
        id: "orca",
        label: "ORCA Computing",
        workload:
          "Photonic workloads · device-specific programming model required",
      },
    ],
  },
];
// Control electronics are an integration layer, not a physical QPU technology.
export const quantumControlSystems = [
  { id: "quantum_machines", label: "Quantum Machines" },
];

export function hardwareAdapterStatus(
  vendor: HardwareVendor,
  report?: ExecutionCapabilities | null,
) {
  if (!vendor.adapterId) return "No dedicated SDK adapter verified";
  const adapter = report?.hardware.providers?.find(
    (value) => value.id === vendor.adapterId,
  );
  if (!adapter || adapter.adapter_status === "not_checked")
    return "Not checked";
  return adapter.adapter_status === "module_present"
    ? "Module installed"
    : "Not found in selected SDK";
}
