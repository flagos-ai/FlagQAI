import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultExecutionProfile,
  executionSummary,
} from "../src/state/execution-profile.ts";
import { computeBackendLabel } from "../src/state/compute-backend.ts";
test("execution identity distinguishes simulator method from compute transport", () => {
  const profile = { ...defaultExecutionProfile, method: "mps", device: "cpu" };
  assert.equal(
    executionSummary(profile),
    "Simulator · Matrix product state · MPS · cpu",
  );
  assert.equal(
    computeBackendLabel({
      backend: "flagquantum_pytorch_cpu",
      transport: "ssh",
      execution: { profile, revision: 1, stale: false },
    }),
    "Simulator · Matrix product state · MPS · cpu · ssh",
  );
});

test("CPU-only environments still show unavailable GPU and domestic AI platforms", async () => {
  const { executionDeviceChoices, separateExecutionWorkflows } =
    await import("../src/state/execution-profile.ts");
  const rows = executionDeviceChoices(
    {
      devices: [
        {
          id: "cpu",
          label: "CPU",
          methods: [{ id: "statevector", available: true }],
        },
      ],
      device_families: [{ id: "flagos", status: "dependency_missing" }],
    },
    "cpu",
  );
  assert.equal(rows.find((row) => row.id === "cpu").disabled, false);
  assert.equal(rows.find((row) => row.id === "cuda:0").disabled, true);
  assert.match(
    rows.find((row) => row.id === "flagos:0").label,
    /domestic.*runtime not installed/,
  );
  assert.equal(rows.find((row) => row.id === "flagos:0").disabled, true);
  assert.equal(
    separateExecutionWorkflows.find((row) => row.id === "pauli_propagation")
      .label,
    "Pauli propagation",
  );
});
test("detected accelerators retain their actual model names and successful methods", async () => {
  const { executionDeviceChoices } =
    await import("../src/state/execution-profile.ts");
  const report = {
    devices: [
      {
        id: "cuda:1",
        label: "GPU fixture",
        methods: [{ id: "statevector", available: true }],
      },
      {
        id: "flagos:0",
        label: "AI chip fixture",
        methods: [{ id: "statevector", available: true }],
      },
    ],
  };
  const rows = executionDeviceChoices(report, "cuda:1");
  assert.equal(
    rows.find((row) => row.id === "cuda:1").label,
    "GPU fixture · cuda:1",
  );
  assert.equal(rows.find((row) => row.id === "flagos:0").disabled, false);
  assert.equal(rows.filter((row) => row.id.startsWith("cuda")).length, 1);
  report.devices[1].methods[0].available = false;
  assert.equal(
    executionDeviceChoices(report, "cuda:1").find(
      (row) => row.id === "flagos:0",
    ).disabled,
    true,
  );
});

test("QPU catalog distinguishes unchecked adapters from discovered hardware", async () => {
  const { qpuProviderChoices } =
    await import("../src/state/execution-profile.ts");
  const rows = qpuProviderChoices(null);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["quafu", "braket", "azure", "http"],
  );
  for (const row of rows) {
    assert.equal(row.adapter_status, "not_checked");
    assert.equal(row.connection_status, "not_connected");
    assert.deepEqual(row.devices, []);
  }
  const report = {
    hardware: {
      available: false,
      providers: [{ ...rows[0], adapter_status: "module_present" }],
    },
  };
  assert.equal(qpuProviderChoices(report)[0].adapter_status, "module_present");
  assert.equal(report.hardware.available, false);
});
