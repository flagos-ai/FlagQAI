import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const installed = process.env.FLAGQAI_HISTORY_TEST_PACKAGE_ROOT;
const { createFlagQaiServer } = await import(
  installed
    ? pathToFileURL(join(installed, "lib/flagqai-platform/server/index.mjs"))
    : new URL("../../../packages/server/index.mjs", import.meta.url)
);
const { createFlagQaiClient } = await import(
  installed
    ? pathToFileURL(join(installed, "lib/flagqai-platform/sdk/index.mjs"))
    : new URL("../../../packages/sdk/index.mjs", import.meta.url)
);
test("native catalog rename uses offline capability without opening an Agent and protects occupied/running sessions", async () => {
  const rows = [
    {
      id: "past",
      cwd: "/repo",
      title: { text: "Before" },
      hasPrompt: true,
      createdAt: 1,
      updatedAt: 1,
      kind: { kind: "root" },
    },
  ];
  let opens = 0,
    status = "idle";
  const occupied = new Set();
  const rename = async (id, title) => {
    rows.find((r) => r.id === id).title = { text: title };
  };
  const backend = {
    descriptor: { id: "test", label: "Test" },
    detect: async () => ({ installed: true }),
    catalog: {
      list: async () => rows,
      occupiedIds: async () => occupied,
      rename,
    },
    open: async () => {
      opens++;
      return {
        ref: { backendId: "test", sessionId: "past" },
        cwd: "/repo",
        get status() {
          return status;
        },
        capabilities: { rename: { rename: (title) => rename("past", title) } },
        history: async () => [],
        subscribe: () => () => {},
        dispose: async () => {},
        cancel: async () => ({ outcome: "confirmed", stillQueued: [] }),
      };
    },
  };
  const server = createFlagQaiServer({
    port: 0,
    registry: { ids: ["test"], load: async () => backend },
  });
  const address = await server.listen();
  const client = createFlagQaiClient({
    baseUrl: "http://127.0.0.1:" + address.port,
  });
  try {
    assert.equal(
      (await client.renameCatalogSession("test", "past", "After")).title,
      "After",
    );
    assert.equal(opens, 0);
    assert.equal(rows[0].title.text, "After");
    assert.equal((await client.listSessions())[0].actions.rename, true);
    occupied.add("past");
    await assert.rejects(
      client.renameCatalogSession("test", "past", "No"),
      /another process/,
    );
    occupied.clear();
    assert.equal(rows[0].title.text, "After");
    await client.openSession({
      backendId: "test",
      cwd: "/repo",
      sessionId: "past",
    });
    await client.renameCatalogSession("test", "past", "Live title");
    assert.equal(rows[0].title.text, "Live title");
    status = "running";
    await assert.rejects(
      client.renameCatalogSession("test", "past", "Blocked"),
      /Finish/,
    );
    assert.equal(rows[0].title.text, "Live title");
    await assert.rejects(
      client.renameCatalogSession("test", "missing", "No"),
      /not found/,
    );
  } finally {
    await server.close();
  }
});
