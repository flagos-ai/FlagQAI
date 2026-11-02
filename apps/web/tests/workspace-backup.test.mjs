import test from "node:test";
import assert from "node:assert/strict";
import {
  persistWorkspace,
  restoreWorkspace,
  workspaceBackup,
} from "../src/state/persistence.ts";

function memory() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}
test("a failed authoritative write preserves the previous backup and exports the latest live draft", () => {
  const storage = memory();
  const before = restoreWorkspace(storage, "model");
  before.source = "# durable draft";
  assert.deepEqual(persistWorkspace(storage, before), { saved: true });
  const previous = storage.getItem("fq-react-workspace-v1");
  const current = {
    ...before,
    source: "# live draft",
    languageDrafts: { qasm: { name: "Other draft", source: "OPENQASM 2.0;" } },
    projectScratch: { source: "scratch", undo: ["old scratch"] },
  };
  const denied = {
    getItem: storage.getItem,
    setItem() {
      throw new DOMException("No room", "QuotaExceededError");
    },
  };
  assert.deepEqual(persistWorkspace(denied, current), {
    saved: false,
    reason: "quota",
  });
  assert.equal(storage.getItem("fq-react-workspace-v1"), previous);
  assert.equal(restoreWorkspace(storage, "model").source, before.source);
  const backup = JSON.parse(workspaceBackup(current));
  assert.equal(backup.source, current.source);
  assert.equal(backup.languageDrafts.qasm.source, "OPENQASM 2.0;");
  assert.deepEqual(backup.projectScratch.undo, []);
  assert.equal(current.projectScratch.undo.length, 1);
  assert.deepEqual(persistWorkspace(storage, current), { saved: true });
  assert.equal(restoreWorkspace(storage, "model").source, current.source);
});
test("optional legacy mirror failures do not misreport a durable workspace as lost", () => {
  const storage = memory();
  const state = restoreWorkspace(storage, "model");
  const partial = {
    getItem: storage.getItem,
    setItem(key, value) {
      if (key !== "fq-react-workspace-v1") throw Error("Mirror unavailable");
      storage.setItem(key, value);
    },
  };
  assert.deepEqual(persistWorkspace(partial, state), { saved: true });
  assert.equal(restoreWorkspace(storage, "model").source, state.source);
});
test("storage read denial falls back safely and unavailable writes remain explicit", () => {
  const storage = {
    getItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
    setItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
  };
  const state = restoreWorkspace(storage, "jobs");
  assert.equal(state.page, "jobs");
  assert.equal(typeof state.source, "string");
  assert.deepEqual(persistWorkspace(storage, state), {
    saved: false,
    reason: "unavailable",
  });
});

test("nonpersistent UI updates do not repeatedly write an unchanged durable snapshot", () => {
  const storage = memory();
  let writes = 0;
  const measured = {
    getItem: storage.getItem,
    setItem(key, value) {
      writes++;
      storage.setItem(key, value);
    },
  };
  const state = restoreWorkspace(storage, "model");
  persistWorkspace(measured, state);
  const firstWrites = writes;
  assert.ok(firstWrites > 0);
  assert.deepEqual(
    persistWorkspace(measured, {
      ...state,
      busy: true,
      zoom: 120,
      error: { message: "transient" },
    }),
    { saved: true },
  );
  assert.equal(writes, firstWrites);
  persistWorkspace(measured, { ...state, source: "changed code" });
  assert.ok(writes > firstWrites);
  assert.equal(restoreWorkspace(storage, "model").source, "changed code");
});

test("execution settings round-trip without restoring a live submission", () => {
  const storage = memory();
  const state = {
    ...restoreWorkspace(storage, "execution"),
    shots: 64,
    seed: 7,
    jobName: "Bell repeat · seed 7",
    busy: true,
  };
  assert.deepEqual(persistWorkspace(storage, state), { saved: true });
  const restored = restoreWorkspace(storage, "execution");
  assert.equal(restored.shots, 64);
  assert.equal(restored.seed, 7);
  assert.equal(restored.jobName, "Bell repeat · seed 7");
  assert.equal(restored.busy, false);
  assert.equal(restored.execution, null);
  storage.setItem("fq-react-workspace-v1", JSON.stringify({ jobName: 123 }));
  assert.equal(restoreWorkspace(storage, "execution").jobName, "");
});
