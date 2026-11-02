import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  loadResearchRecord,
  adoptionFor,
  validAdoption,
  researchManifest,
} from "../src/state/research-record.ts";
import { qaoaFiles } from "../src/state/qaoa-outcome.ts";
import { iterationPrefix } from "../src/state/qaoa-iteration.ts";
function fixture() {
  const runs = new Map(),
    records = new Map();
  function add(id, parent, expected = 1) {
    const source =
      (parent
        ? iterationPrefix +
          JSON.stringify({
            version: 1,
            run: parent.id,
            source: parent.source_hash,
            archive: parent.experiments[1].id,
            sha256: parent.experiments[1].sha256,
            layers: 2,
            shots: 4,
            seed: 42,
          }) +
          "\n"
        : "") +
      "EDGES = [(0, 1)]\n# " +
      id;
    const hash = createHash("sha256").update(source).digest("hex");
    const run = {
      id,
      name: id,
      source,
      source_hash: hash,
      status: "completed",
      collection_status: "completed",
      experiments: qaoaFiles.map((filename, i) => ({
        id: id + "-" + i,
        filename,
        sha256: String(i).repeat(64),
        has_result: true,
      })),
      created_at: runs.size,
      elapsed_seconds: 1,
      logs: [],
    };
    for (const [i, ref] of run.experiments.entries())
      records.set(ref.id, {
        id: ref.id,
        program: {
          compiled: { qubits: 2, depth: 2, instructions: [] },
          origin: { source, source_hash: hash, run_id: id },
          experiment: {
            ...ref,
            producer_version: "0.4",
            python_run: { id, source_hash: hash },
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
                  values:
                    i === 0
                      ? [0.25, 0.25, 0.25, 0.25]
                      : [
                          (1 - expected) / 2,
                          expected / 2,
                          expected / 2,
                          (1 - expected) / 2,
                        ],
                },
              },
              {
                kind: "counts",
                qubits: [0, 1],
                shots: 4,
                metadata: { seed: 42 },
                batches: [
                  [
                    { key_type: "string", state: "01", count: 2 },
                    { key_type: "string", state: "10", count: 2 },
                  ],
                ],
              },
            ],
          },
        },
      });
    runs.set(id, run);
    return run;
  }
  const root = add("root"),
    child = add("child", root, 0.75),
    other = add("other");
  runs.set("failed", {
    id: "failed",
    name: "failed",
    source: "raise RuntimeError()",
    status: "failed",
    created_at: -1,
    collection_status: "completed",
    experiments: [],
    logs: [],
    elapsed_seconds: 2,
  });
  const turns = [
    {
      goal: "Original optimization request",
      runs: ["failed", "root"],
      outcome: "completed",
    },
    { goal: "Try p=2", runs: ["child"], outcome: "completed" },
    { goal: "Unrelated task", runs: ["other"] },
  ];
  return {
    runs,
    records,
    root,
    child,
    other,
    turns,
    add,
    readers: {
      run: async (id) => {
        if (!runs.has(id)) throw Error("Missing run");
        return runs.get(id);
      },
      experiment: async (id) => records.get(id),
    },
  };
}
test("record joins explicit lineage and same-request failures without mixing unrelated runs", async () => {
  const f = fixture(),
    r = await loadResearchRecord("child", f.turns, f.readers);
  assert.equal(r.root, "root");
  assert.equal(r.goal, "Original optimization request");
  assert.deepEqual(
    r.entries.map((e) => e.id),
    ["failed", "root", "child"],
  );
  assert.equal(r.entries[2].summary.optimized.expected, 0.75);
  assert.equal(r.entries[0].run.status, "failed");
  assert.equal(r.turns.length, 2);
});
test("opening the root discovers descendants, including explicit UI-origin iteration candidates", async () => {
  const f = fixture();
  f.turns = [
    f.turns[0],
    {
      goal: "UI candidate reference",
      runs: [],
      candidates: ["child", "other"],
    },
  ];
  const r = await loadResearchRecord("root", f.turns, f.readers);
  assert.deepEqual(
    r.entries.map((e) => e.id),
    ["failed", "root", "child"],
  );
});
test("partial history remains visible and unavailable runs are never fabricated as completed", async () => {
  const f = fixture();
  f.turns[0].runs.push("missing");
  const r = await loadResearchRecord("root", f.turns, f.readers);
  assert.ok(r.entries.find((e) => e.id === "missing").issue);
  assert.equal(r.entries.find((e) => e.id === "missing").summary, undefined);
  const noContext = await loadResearchRecord("child", [], f.readers);
  assert.match(noContext.goal, /unavailable/);
  assert.ok(noContext.notices.length);
});
test("mismatched lineage cannot be adopted or silently joined as a successful version", async () => {
  const f = fixture();
  f.records.get("root-1").program.experiment.sha256 = "f".repeat(64);
  await assert.rejects(loadResearchRecord("child", f.turns, f.readers));
});
test("adoption is explicit, bound to run/source/archive, and accepts a deliberately lower-performing version", async () => {
  const f = fixture(),
    r = await loadResearchRecord("child", f.turns, f.readers),
    entry = r.entries.find((e) => e.id === "child");
  const a = adoptionFor(entry, "Chosen for a follow-up study");
  assert.ok(validAdoption(r, a));
  assert.equal(validAdoption(r, { ...a, source: "changed" }), false);
  assert.equal(validAdoption(r, { ...a, sha256: "changed" }), false);
  assert.throws(() => adoptionFor(r.entries[0], ""));
  const manifest = researchManifest(r, a);
  assert.equal(manifest.adopted.run, "child");
  assert.equal(manifest.model_cost, null);
  assert.equal(manifest.runs[0].status, "failed");
  assert.equal(manifest.runs[2].source, f.child.source);
  assert.equal(researchManifest(r, { ...a, archive: "missing" }).adopted, null);
});

test("a saved version whose replay check fails cannot become the adopted conclusion", async () => {
  const f = fixture(),
    r = await loadResearchRecord("child", f.turns, f.readers),
    entry = r.entries.find((e) => e.id === "child"),
    adopted = adoptionFor(entry, "");
  entry.summary.replayMatches = false;
  assert.equal(validAdoption(r, adopted), false);
  assert.throws(() => adoptionFor(entry, ""));
});

test("large conversation snapshots are bounded and disclose omitted history", async () => {
  const f = fixture();
  for (let i = 0; i < 80; i++) {
    const id = "extra-" + i;
    f.runs.set(id, { ...f.runs.get("failed"), id });
    f.turns[0].runs.push(id);
  }
  let reads = 0;
  const record = await loadResearchRecord("root", f.turns, {
    ...f.readers,
    run: async (id) => {
      reads++;
      return f.readers.run(id);
    },
  });
  assert.ok(reads <= 64);
  assert.ok(record.entries.length <= 64);
  assert.ok(record.notices.some((n) => n.includes("64")));
});

test("archived reviewed versions restore by verified lineage without fabricated turn ownership", async () => {
  const f = fixture();
  const turns = [f.turns[0]];
  const record = await loadResearchRecord("root", turns, {
    ...f.readers,
    runIds: [...f.runs.keys()],
  });
  assert.deepEqual(
    record.entries.map((e) => e.id),
    ["failed", "root", "child"],
  );
  const adopted = adoptionFor(
    record.entries.find((e) => e.id === "child"),
    "Reviewed separately",
  );
  assert.equal(validAdoption(record, adopted), true);
  assert.deepEqual(
    record.turns,
    turns.map((turn) => ({ ...turn, candidates: undefined })),
  );
  const invalid = fixture();
  invalid.child.source = invalid.child.source.replace(
    invalid.root.source_hash,
    "f".repeat(64),
  );
  const rejected = await loadResearchRecord("root", turns, {
    ...invalid.readers,
    runIds: [...invalid.runs.keys()],
  });
  assert.equal(
    rejected.entries.some((e) => e.id === "child"),
    false,
  );
  assert.equal(validAdoption(rejected, adopted), false);
});
