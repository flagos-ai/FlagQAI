import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { qaoaFiles, qaoaOutcome } from "../src/state/qaoa-outcome.ts";
function fixture() {
  const source = "EDGES = [(0, 1)]\n# saved QAOA experiment\n";
  const source_hash = createHash("sha256").update(source).digest("hex");
  const run = {
    id: "run1",
    source,
    source_hash,
    status: "completed",
    collection_status: "completed",
    collection_errors: [],
    experiments: qaoaFiles.map((filename, i) => ({
      id: `e${i}`,
      filename,
      sha256: String(i).repeat(64),
      has_result: true,
    })),
  };
  const records = run.experiments.map((ref, i) => ({
    id: ref.id,
    program: {
      compiled: { qubits: 2 },
      origin: { source, source_hash, run_id: run.id },
      experiment: {
        ...ref,
        python_run: { id: run.id, source_hash },
        program_hash: i === 0 ? "base" : "optimized",
        execution_plan: {
          fingerprints: {
            environment: "env",
            options: "opts",
            compiler: "compiler",
          },
          decision: { device: "cpu", backend: "pytorch" },
        },
        measurements: [
          {
            kind: "probabilities",
            qubits: [0, 1],
            value: {
              shape: [1, 4],
              values: i === 0 ? [0.25, 0.25, 0.25, 0.25] : [0, 0.5, 0.5, 0],
            },
          },
          {
            kind: "counts",
            qubits: [0, 1],
            shots: 4,
            metadata: { seed: 42 },
            batches: [
              (i === 0
                ? ["00", "01", "10", "11"]
                : ["01", "01", "10", "10"]
              ).map((state) => ({ key_type: "string", state, count: 1 })),
            ],
          },
        ],
      },
    },
  }));
  return { run, records };
}
test("summary derives metrics from archives, not model prose, and binds the source version", async () => {
  const { run, records } = fixture();
  const s = await qaoaOutcome(run, records);
  assert.equal(s.baseline.expected, 0.5);
  assert.equal(s.optimized.expected, 1);
  assert.equal(s.baseline.hit, 0.5);
  assert.equal(s.optimized.hit, 1);
  assert.equal(s.optimum, 1);
  assert.equal(s.replayMatches, true);
  assert.equal(s.sourceHash, run.source_hash);
});
test("rejects mismatched source, archive identity, run and collection provenance", async () => {
  for (const mutate of [
    (f) => {
      f.run.source += "# edit";
    },
    (f) => {
      f.records[1].program.origin.source += "# edit";
    },
    (f) => {
      f.records[1].program.experiment.python_run.id = "other";
    },
    (f) => {
      f.records[1].program.experiment.sha256 = "f".repeat(64);
    },
    (f) => {
      f.records[1].id = "other";
    },
    (f) => {
      f.run.collection_status = "partial";
    },
    (f) => {
      f.run.experiments.push({ ...f.run.experiments[1] });
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(qaoaOutcome(f.run, f.records));
  }
});
test("rejects unsupported qubit order, truncated probabilities and invalid shot totals", async () => {
  for (const mutate of [
    (m) => {
      m[0].qubits = [1, 0];
    },
    (m) => {
      m[0].value.truncated = true;
    },
    (m) => {
      m[0].value.values = [NaN, 0.5, 0.5, 0];
    },
    (m) => {
      m[1].shots = 99;
    },
    (m) => {
      m[1].batches[0][0].state = "oops";
    },
  ]) {
    const f = fixture();
    mutate(f.records[1].program.experiment.measurements);
    await assert.rejects(qaoaOutcome(f.run, f.records));
  }
});
test("replay needs matching distributions, seed, program and recorded environment", async () => {
  for (const mutate of [
    (e) => {
      e.program_hash = "changed";
    },
    (e) => {
      e.execution_plan.fingerprints.environment = "other";
    },
    (e) => {
      e.measurements[1].metadata.seed = 43;
    },
    (e) => {
      e.measurements[0].value.values = [0.1, 0.4, 0.5, 0];
    },
    (e) => {
      e.measurements[1].batches[0][0].state = "00";
    },
  ]) {
    const f = fixture();
    mutate(f.records[2].program.experiment);
    assert.equal((await qaoaOutcome(f.run, f.records)).replayMatches, false);
  }
});
test("unsupported executable graph expressions are never evaluated", async () => {
  const f = fixture();
  f.run.source = "EDGES = make_graph()\n";
  f.run.source_hash = createHash("sha256").update(f.run.source).digest("hex");
  for (const r of f.records) {
    r.program.origin.source = f.run.source;
    r.program.origin.source_hash = f.run.source_hash;
    r.program.experiment.python_run.source_hash = f.run.source_hash;
  }
  await assert.rejects(qaoaOutcome(f.run, f.records), /literal/);
});
