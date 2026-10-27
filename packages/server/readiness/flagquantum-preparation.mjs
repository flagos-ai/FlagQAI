import path from "node:path";

import { runLocalJsonProcess } from "../../scientific-core/execution/local-json-process.mjs";
import { heavyweightMcpLifecyclePolicy } from "../settings/project-settings-catalog.mjs";
import { createMcpPreparationController } from "./mcp-preparation.mjs";

const POLICY = heavyweightMcpLifecyclePolicy("flagquantum");
if (POLICY === null) throw new Error("FlagQuantum heavyweight MCP policy is missing");
export const FLAGQUANTUM_MINIMUM_FREE_BYTES = POLICY.minimumFreeBytes;

function preparationEnvironment(env) {
  return Object.fromEntries([
    "PATH",
    "HOME",
    "TMPDIR",
    "UV_CACHE_DIR",
    "UV_TOOL_DIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
  ].flatMap((key) => typeof env[key] === "string" ? [[key, env[key]]] : []));
}

export async function runFlagQuantumPreparation({
  projectRoot,
  signal,
  onProgress,
  env = process.env,
  runProcess = runLocalJsonProcess,
}) {
  await onProgress?.({
    phase: "installing",
    message: "Preparing the pinned FlagQuantum runtime and its dependencies.",
  });
  const result = await runProcess({
    command: process.execPath,
    args: [path.join(projectRoot, POLICY.probeScript)],
    cwd: projectRoot,
    env: preparationEnvironment(env),
    input: {},
    signal,
    timeoutMs: 30 * 60 * 1000,
    maxOutputBytes: 2 * 1024 * 1024,
    label: "FlagQuantum preparation",
    notFoundMessage: "Node.js is unavailable for FlagQuantum preparation",
  });
  if (
    result?.status !== "ready" ||
    result?.package !== POLICY.packageSpec ||
    !Array.isArray(result.tools) ||
    result.tools.length !== 17
  ) {
    throw new Error("FlagQuantum preparation returned an invalid verification result");
  }
  await onProgress?.({
    phase: "verified",
    message: "The pinned FlagQuantum runtime exposes all 17 declared tools.",
  });
  return { message: "Pinned FlagQuantum runtime prepared and verified." };
}

export function createFlagQuantumPreparationController({
  projectRoot,
  dshHome,
  runProcess,
  env = process.env,
  ...options
} = {}) {
  if (!path.isAbsolute(projectRoot ?? "") || !path.isAbsolute(dshHome ?? "")) {
    throw new TypeError("FlagQuantum preparation requires absolute projectRoot and dshHome");
  }
  const controller = createMcpPreparationController({
    stateRoot: path.join(dshHome, "flagqai", "mcp-preparation"),
    definitions: [{
      serverName: "flagquantum",
      minimumFreeBytes: FLAGQUANTUM_MINIMUM_FREE_BYTES,
    }],
    run: ({ signal, onProgress }) => runFlagQuantumPreparation({
      projectRoot,
      signal,
      onProgress,
      env,
      runProcess,
    }),
    ...options,
  });
  return controller;
}
