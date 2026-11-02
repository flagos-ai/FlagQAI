import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBackendLabel,
  computeBackendName,
  isComputeHealth,
  reportedLimit,
} from "../src/state/compute-backend.ts";

test("backend presentation preserves local, SSH and unknown adapter identity", () => {
  assert.equal(
    computeBackendLabel({
      backend: "flagquantum_pytorch_cpu",
      transport: "local",
    }),
    "PyTorch CPU · local",
  );
  assert.equal(
    computeBackendLabel({
      backend: "flagquantum_pytorch_cpu",
      transport: "SSH",
    }),
    "PyTorch CPU · SSH",
  );
  assert.equal(
    computeBackendLabel({
      backend: "custom_gpu_adapter",
      transport: "cluster",
    }),
    "custom_gpu_adapter · cluster",
  );
  assert.equal(
    computeBackendName({ backend: "test-only", transport: "fixture" }),
    "Scripted compute fixture",
  );
});

test("missing backend identity and invalid limits are not presented as verified configuration", () => {
  for (const value of [
    null,
    {},
    { backend: "cpu" },
    { backend: "", transport: "local" },
    { backend: "cpu", transport: 1 },
  ])
    assert.equal(isComputeHealth(value), false);
  assert.equal(
    isComputeHealth({ backend: "cpu", transport: "local", max_qubits: 16 }),
    true,
  );
  for (const value of [undefined, null, -1, 0, 1.5, "16", Infinity])
    assert.equal(reportedLimit(value), "Not reported");
  assert.equal(reportedLimit(16), "16");
});
