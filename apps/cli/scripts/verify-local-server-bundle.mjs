import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { evaluate } from "@deepseek-ai/cordis-plugin-loader";
import { parse as parseYaml } from "yaml";
import { parseServeArgs } from "../bin/serve-args.js";
import { runSourceServer } from "../bin/source-runtime.js";
import { SCIENTIFIC_RUNTIME_FILES } from "./scientific-runtime-files.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const scientificSource = join(repositoryRoot, "packages/scientific-core");
const scientificBundle = join(repositoryRoot, "apps/cli/lib/flagqai-platform/scientific-core");

async function filesBelow(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(root, path));
    else files.push(relative(root, path).split(sep).join("/"));
  }
  return files;
}

function relativeImports(source) {
  const declarations = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"](\.[^'"]+)['"]/gu;
  const dynamic = /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/gu;
  return [...source.matchAll(declarations), ...source.matchAll(dynamic)].map(match => match[1]);
}

const selectedScientificFiles = new Set(SCIENTIFIC_RUNTIME_FILES);
assert.deepEqual(await filesBelow(scientificBundle).then(files => files.sort()), [...selectedScientificFiles].sort(),
  "installed scientific-core must contain exactly the reviewed runtime files");
for (const file of selectedScientificFiles) {
  const sourcePath = join(scientificSource, file);
  const source = await readFile(sourcePath, "utf8");
  assert.equal(await readFile(join(scientificBundle, file), "utf8"), source,
    `bundled scientific runtime differs from its source: ${file}`);
  if (!file.endsWith(".mjs")) continue;
  for (const specifier of relativeImports(source)) {
    const dependency = relative(scientificSource, resolve(dirname(sourcePath), specifier)).split(sep).join("/");
    assert.ok(selectedScientificFiles.has(dependency), `${file} imports unbundled scientific runtime ${dependency}`);
  }
}
for (const file of await filesBelow(join(repositoryRoot, "packages/server"))) {
  if (!file.endsWith(".mjs")) continue;
  const sourcePath = join(repositoryRoot, "packages/server", file);
  for (const specifier of relativeImports(await readFile(sourcePath, "utf8"))) {
    const dependency = relative(scientificSource, resolve(dirname(sourcePath), specifier)).split(sep).join("/");
    if (!dependency.startsWith("../")) {
      assert.ok(selectedScientificFiles.has(dependency), `server/${file} imports unbundled scientific runtime ${dependency}`);
    }
  }
}

const launcher = await readFile(new URL("../bin/flagqai.js", import.meta.url), "utf8");
assert.match(launcher, /process\.argv\[2\] === ["']serve["']/);
assert.match(launcher, /FLAGQAI_SERVER_MODE/);
assert.match(launcher, /process\.argv\[2\] === ["']attach["']/);
assert.match(launcher, /CLI-first edition/);
const patch = parseYaml(await readFile(new URL("../cordis.patch.yml", import.meta.url), "utf8"), { logLevel: "silent" });
const profileRows = patch.flatMap(item => Array.isArray(item?.insert) ? item.insert : []);
const presentationRows = ["flagqai-panels", "flagqai-plugin-host", "working-activity"];
const previousServerMode = process.env.FLAGQAI_SERVER_MODE;
try {
  for (const mode of ["0", "1"]) {
    process.env.FLAGQAI_SERVER_MODE = mode;
    for (const id of presentationRows) {
      const row = profileRows.find(candidate => candidate?.id === id);
      assert.equal(typeof row?.disabled, "string", `${id} needs a server-mode disable expression`);
      const disabled = evaluate({ baseUrl: new URL("../cordis.patch.yml", import.meta.url).href,
        loader: { entries: () => [] } }, row.disabled);
      assert.equal(disabled, mode === "1",
        `${id} must stay active in the default TUI and disabled in headless service mode`);
    }
  }
} finally {
  if (previousServerMode === undefined) delete process.env.FLAGQAI_SERVER_MODE;
  else process.env.FLAGQAI_SERVER_MODE = previousServerMode;
}
assert.deepEqual(parseServeArgs([]), { host: "127.0.0.1", port: 4096 });
assert.deepEqual(parseServeArgs(["--host=localhost", "--port", "0"]), { host: "localhost", port: 0 });
assert.throws(() => parseServeArgs(["--unknown"]), /unknown flagqai serve option/);
const sourceRuntimeFixture = await mkdtemp(join(tmpdir(), "flagqai-source-runtime-"));
assert.equal(await runSourceServer({ root: join(sourceRuntimeFixture, "published-package") }), false);
const server = await import("../lib/flagqai-platform/server/index.mjs");
const permissionEvidence = await import("../lib/flagqai-platform/scientific-core/permission-decisions.mjs");
assert.equal(typeof permissionEvidence.createPermissionDecisionStore, "function");
const adapter = await import("../lib/flagqai-platform/harness-adapter/index.mjs");
assert.equal(typeof adapter.createHarnessComposition, "function");
assert.equal(
  await readFile(new URL("../lib/flagqai-platform/scientific-core/flagquantum-call-evidence.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../../../packages/scientific-core/flagquantum-call-evidence.mjs", import.meta.url), "utf8"),
);
assert.equal(typeof adapter.startHarnessHost, "function");
assert.equal(typeof adapter.initializeHarnessPresets, "function");
assert.equal(typeof adapter.createInteractionRouter, "function");
assert.equal(typeof adapter.createAgentResolver, "function");
assert.equal(typeof adapter.createProviderManager, "function");
assert.equal(typeof adapter.createWorkspaceFileScope, "function");
assert.equal(typeof adapter.createModelManager, "function");
assert.equal(
  await readFile(new URL("../lib/flagqai-platform/harness-adapter/model-manager.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../../../packages/harness-adapter/model-manager.mjs", import.meta.url), "utf8"),
);
assert.equal(
  await readFile(new URL("../lib/flagqai-platform/harness-adapter/workspace-files.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../../../packages/harness-adapter/workspace-files.mjs", import.meta.url), "utf8"),
);
assert.equal(
  await readFile(new URL("../lib/flagqai-platform/harness-adapter/provider-manager.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../../../packages/harness-adapter/provider-manager.mjs", import.meta.url), "utf8"),
);
assert.equal(
  await readFile(new URL("../lib/flagqai-platform/harness-adapter/agent-resolution.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../../../packages/harness-adapter/agent-resolution.mjs", import.meta.url), "utf8"),
);
assert.equal(
  await readFile(new URL("../lib/flagqai-platform/harness-adapter/interactions.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../../../packages/harness-adapter/interactions.mjs", import.meta.url), "utf8"),
);
assert.equal(
  await readFile(new URL("../lib/flagqai-platform/harness-adapter/index.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../../../packages/harness-adapter/index.mjs", import.meta.url), "utf8"),
);
const protocol = await import("../lib/flagqai-platform/protocol/index.mjs");
const sdk = await import("../lib/flagqai-platform/sdk/index.mjs");
assert.equal(typeof server.createFlagQaiServer, "function");
assert.equal(typeof server.createEmptyBackendRegistry, "function");
assert.equal(typeof protocol.FLAGQAI_PROTOCOL_VERSION, "string");
assert.equal(typeof sdk.createFlagQaiClient, "function");
assert.equal(sdk.FLAGQAI_SDK_PROTOCOL_VERSION, protocol.FLAGQAI_PROTOCOL_VERSION);
assert.equal(typeof sdk.createFlagQaiClient({ baseUrl: "http://127.0.0.1:4096" }).answerPermission, "function");
assert.equal(typeof sdk.createFlagQaiClient({ baseUrl: "http://127.0.0.1:4096" }).answerQuestion, "function");
assert.equal(typeof sdk.createFlagQaiClient({ baseUrl: "http://127.0.0.1:4096" }).cancelQuestion, "function");
const instance = server.createFlagQaiServer({ port: 0 });
await instance.close();
const host = await readFile(new URL("../lib/types/dsh-adapter/server-host.js", import.meta.url), "utf8");
assert.match(host, /createRuntimeBackendRegistry/);
assert.match(host, /createFlagQaiServer/);
assert.match(host, /createHeadlessInteractionRouter/);
assert.doesNotMatch(host, /flagqai-platform\/web/);

// The package alias works for synchronous compatibility exports after relocation.
const frames = await import('../lib/types/dsh-adapter/sessions/frames.js');
const header = await import('../lib/types/dsh-adapter/sessions/header.js');
const digest = await import('../lib/types/dsh-adapter/sessions/digest.js');
assert.equal(digest.digestSession, adapter.sessionLogDigest.digestSession);
assert.equal(digest.recoverSessionMetadata, adapter.sessionLogDigest.recoverSessionMetadata);
assert.equal(typeof adapter.createSessionIndexStore, 'function');
assert.equal(frames.decodeFrame, adapter.sessionLogFrames.decodeFrame);
assert.equal(header.readHeader, adapter.sessionLogHeader.readHeader);
for (const file of ['frames.mjs', 'frames.d.mts', 'header.mjs', 'header.d.mts', 'digest.mjs', 'digest.d.mts', 'digest-types.mjs', 'digest-types.d.mts', 'store.mjs', 'store.d.mts', 'list.mjs', 'list.d.mts', 'snapshot.mjs', 'snapshot.d.mts', 'recovery.mjs', 'recovery.d.mts', 'listing-types.mjs', 'listing-types.d.mts', 'LICENSE']) {
  assert.equal(
    await readFile(new URL(`../lib/flagqai-platform/harness-adapter/session-log/${file}`, import.meta.url), 'utf8'),
    await readFile(new URL(`../../../packages/harness-adapter/session-log/${file}`, import.meta.url), 'utf8'),
  );
}

for (const name of ['events', 'session', 'capabilities', 'refs', 'presentation', 'channel-view']) {
  for (const ext of ['mjs', 'd.mts']) {
    assert.equal(
      await readFile(new URL(`../lib/flagqai-platform/protocol/agent/${name}.${ext}`, import.meta.url), 'utf8'),
      await readFile(new URL(`../../../packages/protocol/agent/${name}.${ext}`, import.meta.url), 'utf8'),
    );
  }
}
assert.equal(
  await readFile(new URL('../lib/flagqai-platform/protocol/agent/LICENSE', import.meta.url), 'utf8'),
  await readFile(new URL('../../../packages/protocol/agent/LICENSE', import.meta.url), 'utf8'),
);
for (const file of ['native-translator.mjs', 'native-translator.d.mts', 'session-mounts.mjs', 'session-mounts.d.mts', 'live-session.mjs', 'live-session.d.mts', 'persisted-session.mjs', 'persisted-session.d.mts', 'session-log-access.mjs', 'session-log-access.d.mts', 'native-session.mjs', 'native-session.d.mts', 'child-transcript.mjs', 'child-transcript.d.mts', 'session-jobs.mjs', 'session-jobs.d.mts', 'session-subagents.mjs', 'session-subagents.d.mts', 'tool-output.mjs', 'tool-output.d.mts', 'session-actions.mjs', 'session-actions.d.mts', 'session-compaction.mjs', 'session-compaction.d.mts']) {
  assert.equal(
    await readFile(new URL(`../lib/flagqai-platform/harness-adapter/${file}`, import.meta.url), 'utf8'),
    await readFile(new URL(`../../../packages/harness-adapter/${file}`, import.meta.url), 'utf8'),
  );
}
const nativeSession = await import('../lib/types/dsh-adapter/backend/session.js');
assert.equal(nativeSession.isAgentSession, adapter.isAgentSession);
const nativeJobs = await import('../lib/types/dsh-adapter/backend/jobs.js');
assert.equal(nativeJobs.createDshJobsCapability, adapter.createNativeJobsCapability);
const nativeRefs = await import('../lib/types/agent/refs.js');
const sharedRefs = await import('../lib/flagqai-platform/protocol/agent/refs.mjs');
assert.equal(nativeRefs.parseSessionRef, sharedRefs.parseSessionRef);
console.log("PASS FlagQAI local server bundle, interaction bridge, shared Markdown assets, and session-log codec");

// Shared client logic must survive relocation with no repository-source imports.
const uiCore = await import("../lib/flagqai-platform/ui-core/projection.mjs");
assert.equal(typeof uiCore.createChannelProjection, "function");
for (const name of ["projection", "usage", "live-output", "transcript", "selection-record", "activity", "history-restore", "job-format", "agent-messages"]) {
  for (const extension of ["mjs", "d.mts"]) {
    assert.equal(
      await readFile(new URL(`../lib/flagqai-platform/ui-core/${name}.${extension}`, import.meta.url), "utf8"),
      await readFile(new URL(`../../../packages/ui-core/${name}.${extension}`, import.meta.url), "utf8"),
    );
  }
}
for (const name of ["projection-types.d.mts", "LICENSE"]) {
  assert.equal(
    await readFile(new URL(`../lib/flagqai-platform/ui-core/${name}`, import.meta.url), "utf8"),
    await readFile(new URL(`../../../packages/ui-core/${name}`, import.meta.url), "utf8"),
  );
}
