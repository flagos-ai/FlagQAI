import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BasicCompactionEngine } from "../../cli/node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js";
import { pathToFileURL } from "node:url";
const installed = process.env.FLAGQAI_POLICY_TEST_PACKAGE_ROOT;
const runtime = (path) =>
  installed
    ? pathToFileURL(join(installed, "lib/flagqai-platform", path))
    : new URL("../../../packages/" + path, import.meta.url);
const { createCompactionPolicy } = await import(
  runtime("harness-adapter/compaction-policy.mjs")
);
const { createFlagQaiServer } = await import(runtime("server/index.mjs"));
const { createFlagQaiClient } = await import(runtime("sdk/index.mjs"));
const config = () =>
  Object.freeze({
    auto: true,
    thresholdRatio: 0.8,
    retainRatio: 0.16,
    headroomTokens: 65536,
    maxTokens: 65536,
    modelPolicies: [],
    summarizationProvider: "",
    summarizationModel: "",
    compactionRetries: 1,
    maxOverflowRetries: 1,
  });
function engine() {
  const value = Object.create(BasicCompactionEngine.prototype);
  value.config = config();
  value.sessionPolicies = new WeakMap();
  return value;
}
const agent = (cwd, id) => ({
  status: "idle",
  session: { id, header: { cwd }, requestHeader: () => undefined },
});
test("native auto policy isolates sessions, restores preferences and gates the original automatic hooks", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "flagqai-policy-"));
  try {
    const service = engine(),
      a = agent(cwd, "a"),
      b = agent(cwd, "b");
    const policy = createCompactionPolicy({ agent: a, service });
    assert.deepEqual(policy.read(), {
      enabled: true,
      thresholdRatio: 0.8,
      scope: "session",
    });
    await policy.update({ enabled: false, thresholdRatio: 0.7 });
    assert.equal(service.readAutoPolicy(b).enabled, true);
    assert.equal(service.config.thresholdRatio, 0.8);
    const hooks = {};
    service.ctx = {
      on: (name, fn) => (hooks[name] = fn),
      logger: { info() {}, warn() {} },
    };
    service._registerAutomaticCompaction();
    let runs = 0;
    service.compactIfNeeded = async () => {
      runs++;
      return null;
    };
    await hooks["agent/pre-step"](
      { agent: a, signal: new AbortController().signal },
      () => {},
    );
    assert.equal(runs, 0);
    await hooks["agent/pre-step"](
      { agent: b, signal: new AbortController().signal },
      () => {},
    );
    assert.equal(runs, 1);
    const fresh = engine(),
      resumed = agent(cwd, "a");
    assert.deepEqual(
      createCompactionPolicy({ agent: resumed, service: fresh }).read(),
      { enabled: false, thresholdRatio: 0.7, scope: "session" },
    );
    await policy.update({ enabled: true, thresholdRatio: 0.9 });
    assert.equal(service.readAutoPolicy(a).thresholdRatio, 0.9);
    for (const value of [0, 0.49, 0.96, NaN])
      await assert.rejects(
        policy.update({ enabled: true, thresholdRatio: value }),
      );
    a.status = "running";
    await assert.rejects(
      policy.update({ enabled: false, thresholdRatio: 0.75 }),
      /Finish/,
    );
    assert.equal(service.readAutoPolicy(a).enabled, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
test("SDK policy routes read back native values and refuse running, malformed and unsupported updates", async () => {
  let status = "idle",
    policy = { enabled: true, thresholdRatio: 0.8, scope: "session" };
  const capabilities = {
    compact: {
      run: async () => {},
      policy: {
        read: () => policy,
        update: async (input) => (policy = { ...input, scope: "session" }),
      },
    },
  };
  const backend = {
    open: async () => ({
      ref: { backendId: "test", sessionId: "a" },
      cwd: "/repo",
      get status() {
        return status;
      },
      capabilities,
      history: async () => [],
      subscribe: () => () => {},
      dispose: async () => {},
    }),
  };
  const server = createFlagQaiServer({
    port: 0,
    registry: { ids: ["test"], load: async () => backend },
  });
  const address = await server.listen(),
    client = createFlagQaiClient({
      baseUrl: "http://127.0.0.1:" + address.port,
    });
  try {
    const session = await client.openSession({
      backendId: "test",
      cwd: "/repo",
    });
    assert.equal(
      (await client.getCompactionPolicy(session.id)).policy.thresholdRatio,
      0.8,
    );
    assert.equal(
      (
        await client.setCompactionPolicy(session.id, {
          enabled: false,
          thresholdRatio: 0.85,
        })
      ).policy.enabled,
      false,
    );
    status = "running";
    await assert.rejects(
      client.setCompactionPolicy(session.id, {
        enabled: true,
        thresholdRatio: 0.8,
      }),
      /Finish/,
    );
    status = "idle";
    await assert.rejects(
      client.setCompactionPolicy(session.id, {
        enabled: true,
        thresholdRatio: 1,
      }),
      /50%/,
    );
    delete capabilities.compact.policy;
    await assert.rejects(
      client.getCompactionPolicy(session.id),
      /does not expose/,
    );
  } finally {
    await server.close();
  }
});
