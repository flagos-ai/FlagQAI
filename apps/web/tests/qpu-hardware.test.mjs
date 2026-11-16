import test from "node:test";
import assert from "node:assert/strict";
import {
  qpuTechnologies,
  quantumControlSystems,
  hardwareAdapterStatus,
} from "../src/state/qpu-hardware.ts";

test("hardware catalog groups requested vendors by technology, separate from control and cloud access", () => {
  const routes = Object.fromEntries(
    qpuTechnologies.map((route) => [
      route.id,
      route.vendors.map((vendor) => vendor.id),
    ]),
  );
  assert.deepEqual(routes.ion_trap, ["ionq", "quantinuum"]);
  assert.deepEqual(routes.superconducting, [
    "quafu",
    "anyon",
    "iqm",
    "oqc",
    "tii",
  ]);
  assert.deepEqual(routes.neutral_atom, ["infleqtion", "pasqal", "quera"]);
  assert.deepEqual(routes.photonic, ["qboson", "orca"]);
  assert.equal(quantumControlSystems[0].id, "quantum_machines");
  const vendorIds = Object.values(routes).flat();
  for (const id of ["braket", "azure", "http", "quantum_machines"])
    assert.ok(!vendorIds.includes(id));
  assert.equal(new Set(vendorIds).size, vendorIds.length);
});

test("Quafu module evidence never enables other catalog vendors through generic cloud adapters", () => {
  const vendors = qpuTechnologies.flatMap((route) => route.vendors);
  const report = {
    hardware: {
      providers: ["quafu", "braket", "azure", "http"].map((id) => ({
        id,
        adapter_status: "module_present",
      })),
    },
  };
  assert.equal(
    hardwareAdapterStatus(
      vendors.find((vendor) => vendor.id === "quafu"),
      report,
    ),
    "Module installed",
  );
  for (const vendor of vendors.filter((vendor) => vendor.id !== "quafu")) {
    assert.equal(
      hardwareAdapterStatus(vendor, report),
      "No dedicated SDK adapter verified",
    );
  }
  const quafu = vendors.find((vendor) => vendor.id === "quafu");
  assert.equal(hardwareAdapterStatus(quafu, null), "Not checked");
  assert.equal(
    hardwareAdapterStatus(quafu, {
      hardware: { providers: [{ id: "quafu", adapter_status: "not_found" }] },
    }),
    "Not found in selected SDK",
  );
  const qboson = vendors.find((vendor) => vendor.id === "qboson");
  assert.equal(qboson.accessChannel, "Kaiwu SDK");
  assert.match(qboson.workload, /Ising \/ QUBO optimization and sampling/);
  assert.equal(
    hardwareAdapterStatus(qboson, report),
    "No dedicated SDK adapter verified",
  );
});
