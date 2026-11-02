import test from "node:test";
import assert from "node:assert/strict";
import {
  backupDrafts,
  mergeBackupDrafts,
  MAX_BACKUP_BYTES,
} from "../src/state/backup-import.ts";
import { restoreWorkspace, workspaceBackup } from "../src/state/persistence.ts";
import { workspaceReducer } from "../src/state/reducer.ts";
const fresh = () =>
  restoreWorkspace({ getItem: () => null, setItem() {} }, "model");
const encode = (extra = {}) =>
  JSON.stringify({
    schema: "flagqai.quantum-workspace.v1",
    name: "Bell",
    source: "print('saved')\n",
    language: "python",
    ...extra,
  });
test("actual exported backups recover exact code, inactive drafts and both sides of pending edits", () => {
  const state = fresh();
  state.source = "# 中文\r\n\tprint('draft')\n";
  state.languageDrafts = {
    qasm: { name: "Other", source: "// other\n", undo: [] },
  };
  state.projectTabs = [
    {
      name: "helper.py",
      source: "# dirty",
      language: "python",
      editorLink: { incoming: { source: "# Agent" } },
    },
  ];
  const drafts = backupDrafts(workspaceBackup(state));
  assert.deepEqual(
    drafts.map((m) => m.source),
    [state.source, "# dirty", "# Agent", "// other\n"],
  );
  assert.ok(
    drafts.every(
      (m) => Object.keys(m).sort().join() === "language,name,source",
    ),
  );
});
test("recovery preserves live source, links, runs, undo, project and selection while avoiding name conflicts", () => {
  const state = fresh();
  state.models = [{ name: "Bell", source: "existing", language: "python" }];
  state.undo = ["before"];
  const before = structuredClone(state);
  const next = workspaceReducer(state, {
    type: "import-backup-drafts",
    models: backupDrafts(encode()),
  });
  assert.equal(next.models[1].name, "Bell · Restored 1");
  assert.deepEqual({ ...next, models: state.models }, before);
  assert.deepEqual(state, before);
  const again = workspaceReducer(next, {
    type: "import-backup-drafts",
    models: backupDrafts(encode()),
  });
  assert.deepEqual(again, next);
});
test("duplicate code is scoped by language and recovery strips untrusted metadata", () => {
  const drafts = backupDrafts(
    encode({
      models: [
        {
          name: "same",
          source: "print('saved')\n",
          language: "python",
          editorLink: { id: "arbitrary" },
        },
        { name: "qasm", source: "print('saved')\n", language: "qasm" },
      ],
    }),
  );
  assert.equal(drafts.length, 2);
  assert.equal(mergeBackupDrafts([], drafts).length, 2);
  assert.equal(drafts[1].editorLink, undefined);
  const name = "x".repeat(256);
  const merged = mergeBackupDrafts(
    [{ name, source: "old", language: "python" }],
    [{ name, source: "new", language: "python" }],
  );
  assert.ok(merged[1].name.length <= 256);
  assert.doesNotThrow(() => backupDrafts(encode({ models: merged })));
});
test("corrupt, unsupported, malformed and excessive backups are rejected as a whole", () => {
  for (const text of [
    "{",
    "null",
    "[]",
    encode({ schema: "future" }),
    encode({ source: null }),
    encode({ models: {} }),
    encode({ languageDrafts: { shell: {} } }),
    encode({ projectTabs: [null] }),
    encode({ models: [{ name: "invalid", source: "x", language: "shell" }] }),
    encode({ source: "\0" }),
    encode({ source: "x".repeat(1024 * 1024 + 1) }),
    " ".repeat(MAX_BACKUP_BYTES + 1),
  ])
    assert.throws(() => backupDrafts(text));
});
