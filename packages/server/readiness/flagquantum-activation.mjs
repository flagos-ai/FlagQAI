import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";

import {
  executeProjectSettingsCommand,
  readProjectSettings,
} from "../settings/project-settings.mjs";

const SERVER_NAME = "flagquantum";
const SOURCE_CONFIG = "runtime/flagqai/agent-presets/flagqai/agent.cordis.yml";
const RUNTIME_CONFIG = ".agent-presets/flagqai/agent.cordis.yml";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function safeRegularFile(root, relativePath, label) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new TypeError(`${label} root must be a regular directory`);
  }
  const resolvedRoot = await realpath(root);
  const candidate = path.resolve(resolvedRoot, relativePath);
  const info = await lstat(candidate);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new TypeError(`${label} must be a regular file`);
  }
  const resolved = await realpath(candidate);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new TypeError(`${label} escapes its root`);
  }
  return { path: resolved, mode: info.mode & 0o777 };
}

async function stableSourceSnapshot(projectRoot) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readProjectSettings(projectRoot);
    const source = await safeRegularFile(projectRoot, SOURCE_CONFIG, "FlagQAI preset source");
    const contents = await readFile(source.path, "utf8");
    if (digest(contents) === snapshot.mcpRevision) {
      return { snapshot, contents, source };
    }
  }
  throw new TypeError("FlagQAI preset changed while enabling FlagQuantum; retry the action");
}

/**
 * Enable the prepared FlagQuantum connection in project settings and publish
 * the exact resulting composition into the running Harness home. Harness will
 * observe the file stamp and create a new standing generation for sessions
 * created afterwards; existing sessions intentionally keep their generation.
 */
export async function activatePreparedFlagQuantum({
  projectRoot,
  dshHome,
  preparationController,
  credentials,
  now = () => performance.now(),
} = {}) {
  if (!path.isAbsolute(projectRoot ?? "") || !path.isAbsolute(dshHome ?? "")) {
    throw new TypeError("FlagQuantum activation requires absolute projectRoot and dshHome");
  }
  if (!preparationController || typeof preparationController.snapshot !== "function") {
    throw new TypeError("FlagQuantum activation requires a preparation controller");
  }
  const startedAt = now();
  const preparation = await preparationController.snapshot(SERVER_NAME);
  if (preparation.status !== "succeeded") {
    throw new TypeError("Prepare and verify the FlagQuantum runtime before enabling it");
  }

  let { snapshot } = await stableSourceSnapshot(projectRoot);
  let server = snapshot.mcpServers.find((entry) => entry.serverName === SERVER_NAME);
  if (!server) throw new TypeError("FlagQuantum MCP configuration is missing");
  if (!server.enabled) {
    snapshot = await executeProjectSettingsCommand(projectRoot, {
      action: "mcp.update",
      serverName: SERVER_NAME,
      revision: snapshot.mcpRevision,
      enabled: true,
      toolCallTimeoutMs: server.toolCallTimeoutMs,
      reconnect: server.reconnect,
    }, { credentials });
    server = snapshot.mcpServers.find((entry) => entry.serverName === SERVER_NAME);
  }
  if (!server?.enabled) {
    throw new TypeError("FlagQuantum MCP could not be enabled");
  }

  const sourceGuard = await safeRegularFile(
    projectRoot,
    SOURCE_CONFIG,
    "FlagQAI preset source",
  );
  const target = await safeRegularFile(dshHome, RUNTIME_CONFIG, "Harness preset target");
  await withFileLock(sourceGuard.path, async () => {
    const source = await stableSourceSnapshot(projectRoot);
    await withFileLock(target.path, () => writeFileAtomic(target.path, source.contents, {
      mode: target.mode,
      dirMode: 0o700,
    }));
  });

  return {
    schemaVersion: "1.0",
    serverName: SERVER_NAME,
    status: "new_session_required",
    enabled: true,
    message: "FlagQuantum is enabled for new sessions. Start a new session to load its 17 tools.",
    metrics: {
      durationMs: Math.max(0, Math.ceil(now() - startedAt)),
      outcome: "new_session_required",
    },
  };
}
