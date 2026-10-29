import test from "node:test";
import assert from "node:assert/strict";
import {
  filterSessionHistory,
  sessionResumeBlock,
} from "../src/state/agent-history.ts";
const item = {
  sessionId: "past",
  backendId: "dsh",
  title: "Bell experiment",
  cwd: "/repo",
  updatedAt: 10,
  createdAt: 1,
  availability: "available",
  kind: "root",
  model: "test-model",
};
test("history is scoped to workspace, searchable by metadata and ordered by recent activity without mutating native records", () => {
  const list = [
    item,
    { ...item, sessionId: "newer", updatedAt: 20 },
    { ...item, cwd: "/other", sessionId: "foreign" },
  ];
  assert.deepEqual(
    filterSessionHistory(list, "", "/repo").map((s) => s.sessionId),
    ["newer", "past"],
  );
  assert.equal(list[0], item);
  assert.equal(filterSessionHistory(list, "bell", "/repo").length, 2);
  assert.equal(filterSessionHistory(list, "test-model", "/repo").length, 2);
  assert.equal(filterSessionHistory(list, "PAST", "/repo").length, 1);
  assert.equal(filterSessionHistory(list, "no match", "/repo").length, 0);
});
test("current, occupied and working sessions cannot be accidentally resumed; active Web resources remain selectable", () => {
  assert.equal(sessionResumeBlock(item, null, false), undefined);
  assert.match(sessionResumeBlock(item, null, true), /Finish/);
  assert.match(
    sessionResumeBlock({ ...item, availability: "occupied" }, null, false),
    /another client/,
  );
  assert.equal(
    sessionResumeBlock(item, { sessionId: "past", backendId: "dsh" }, false),
    "Current session",
  );
  assert.equal(
    sessionResumeBlock(
      { ...item, availability: "active", resourceId: "active-web" },
      null,
      false,
    ),
    undefined,
  );
});

test("rename and trash protect occupied/current sessions but permit restoring visibility", async () => {
  const { historyActionBlock } = await import("../src/state/agent-history.ts");
  assert.equal(historyActionBlock(item, null, false, "rename"), undefined);
  assert.match(
    historyActionBlock(
      { ...item, actions: { rename: false } },
      null,
      false,
      "rename",
    ),
    /not support/,
  );
  assert.match(
    historyActionBlock(
      item,
      { backendId: "dsh", sessionId: "past" },
      false,
      "trash",
    ),
    /another chat/,
  );
  assert.equal(
    historyActionBlock(
      item,
      { backendId: "dsh", sessionId: "past" },
      false,
      "rename",
    ),
    undefined,
  );
  assert.match(
    historyActionBlock(
      { ...item, availability: "occupied" },
      null,
      false,
      "trash",
    ),
    /another client/,
  );
  assert.equal(
    historyActionBlock(
      { ...item, availability: "occupied" },
      null,
      false,
      "restore",
    ),
    undefined,
  );
});
