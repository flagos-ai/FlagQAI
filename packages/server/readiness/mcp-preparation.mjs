import { randomUUID } from "node:crypto";
import { mkdir, readFile, statfs } from "node:fs/promises";
import path from "node:path";

import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";

const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_DIAGNOSTIC_BYTES = 4096;

function boundedText(value, maximumBytes = MAX_DIAGNOSTIC_BYTES) {
  const text = String(value ?? "").replaceAll("\0", "").trim();
  const bytes = Buffer.from(text, "utf8");
  return bytes.length <= maximumBytes
    ? text
    : bytes.subarray(bytes.length - maximumBytes).toString("utf8");
}

function timestamp(now) {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("MCP preparation clock returned an invalid date");
  }
  return value.toISOString();
}

function idleState(serverName, now) {
  return {
    schemaVersion: "1.0",
    serverName,
    status: "idle",
    attempt: 0,
    jobId: null,
    phase: "idle",
    message: "",
    reasonCode: null,
    diagnostic: "",
    startedAt: null,
    updatedAt: timestamp(now),
    finishedAt: null,
  };
}

function validateDefinition(definition) {
  if (
    definition === null ||
    typeof definition !== "object" ||
    !SERVER_NAME.test(definition.serverName ?? "") ||
    !Number.isSafeInteger(definition.minimumFreeBytes) ||
    definition.minimumFreeBytes < 0
  ) {
    throw new TypeError("MCP preparation definition is invalid");
  }
  return Object.freeze({
    serverName: definition.serverName,
    minimumFreeBytes: definition.minimumFreeBytes,
  });
}

function validatePersistedState(value, serverName) {
  if (
    value === null ||
    typeof value !== "object" ||
    value.schemaVersion !== "1.0" ||
    value.serverName !== serverName ||
    !new Set(["idle", "preparing", "succeeded", "failed", "cancelled", "action_required"]).has(value.status) ||
    !Number.isSafeInteger(value.attempt) ||
    value.attempt < 0
  ) {
    throw new TypeError("MCP preparation state is invalid");
  }
  const optionalDate = (date, field) => {
    if (date === null) return null;
    if (typeof date !== "string" || Number.isNaN(Date.parse(date))) {
      throw new TypeError(`MCP preparation ${field} is invalid`);
    }
    return new Date(date).toISOString();
  };
  if (
    value.jobId !== null &&
    (typeof value.jobId !== "string" || Buffer.byteLength(value.jobId) > 128)
  ) {
    throw new TypeError("MCP preparation jobId is invalid");
  }
  if (typeof value.phase !== "string" || typeof value.message !== "string") {
    throw new TypeError("MCP preparation progress is invalid");
  }
  if (
    value.reasonCode !== null &&
    (typeof value.reasonCode !== "string" || Buffer.byteLength(value.reasonCode) > 128)
  ) {
    throw new TypeError("MCP preparation reasonCode is invalid");
  }
  return {
    schemaVersion: "1.0",
    serverName,
    status: value.status,
    attempt: value.attempt,
    jobId: value.jobId,
    phase: boundedText(value.phase, 64),
    message: boundedText(value.message, 512),
    reasonCode: value.reasonCode,
    diagnostic: boundedText(value.diagnostic, MAX_DIAGNOSTIC_BYTES),
    startedAt: optionalDate(value.startedAt, "startedAt"),
    updatedAt: optionalDate(value.updatedAt, "updatedAt"),
    finishedAt: optionalDate(value.finishedAt, "finishedAt"),
  };
}

function projectState(state) {
  const started = state.startedAt === null ? null : Date.parse(state.startedAt);
  const finished = state.finishedAt === null ? null : Date.parse(state.finishedAt);
  const lastDurationMs = started === null || finished === null
    ? null
    : Math.max(0, finished - started);
  return {
    ...structuredClone(state),
    metrics: {
      attemptCount: state.attempt,
      lastDurationMs,
      terminalStatus: new Set(["succeeded", "failed", "cancelled", "action_required"])
        .has(state.status) ? state.status : null,
    },
  };
}

export async function availableFilesystemBytes(target) {
  const stats = await statfs(target);
  return Number(stats.bavail) * Number(stats.bsize);
}

export function createMcpPreparationController({
  stateRoot,
  definitions,
  run,
  availableBytes = availableFilesystemBytes,
  now = () => new Date(),
  idFactory = randomUUID,
} = {}) {
  if (!path.isAbsolute(stateRoot ?? "")) {
    throw new TypeError("MCP preparation stateRoot must be absolute");
  }
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new TypeError("MCP preparation definitions must be a non-empty array");
  }
  if (typeof run !== "function" || typeof availableBytes !== "function") {
    throw new TypeError("MCP preparation requires run() and availableBytes()");
  }
  const catalog = new Map(definitions.map((entry) => {
    const definition = validateDefinition(entry);
    return [definition.serverName, definition];
  }));
  if (catalog.size !== definitions.length) {
    throw new TypeError("MCP preparation server names must be unique");
  }

  const states = new Map();
  const jobs = new Map();
  const commandQueues = new Map();
  let disposed = false;
  const statePath = (serverName) => path.join(stateRoot, `${serverName}.json`);

  function definitionFor(serverName) {
    if (!SERVER_NAME.test(serverName ?? "") || !catalog.has(serverName)) {
      throw new TypeError("Unknown heavyweight MCP server");
    }
    return catalog.get(serverName);
  }

  async function persist(state) {
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    await writeFileAtomic(statePath(state.serverName), `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
      dirMode: 0o700,
    });
    states.set(state.serverName, state);
    return structuredClone(state);
  }

  async function load(serverName) {
    definitionFor(serverName);
    if (states.has(serverName)) return states.get(serverName);
    let state;
    try {
      state = validatePersistedState(
        JSON.parse(await readFile(statePath(serverName), "utf8")),
        serverName,
      );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = idleState(serverName, now);
    }
    if (state.status === "preparing") {
      const at = timestamp(now);
      state = {
        ...state,
        status: "failed",
        phase: "interrupted",
        message: "The previous preparation process ended before completion.",
        reasonCode: "PREPARATION_INTERRUPTED",
        diagnostic: "",
        updatedAt: at,
        finishedAt: at,
      };
      await persist(state);
    } else {
      states.set(serverName, state);
    }
    return state;
  }

  function enqueue(serverName, operation) {
    const previous = commandQueues.get(serverName) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const queued = next.catch(() => undefined).finally(() => {
      if (commandQueues.get(serverName) === queued) commandQueues.delete(serverName);
    });
    commandQueues.set(serverName, queued);
    return next;
  }

  async function updateJob(jobId, serverName, patch) {
    const current = await load(serverName);
    if (current.jobId !== jobId || current.status !== "preparing") return current;
    return persist({ ...current, ...patch, updatedAt: timestamp(now) });
  }

  function settle(jobId, serverName, promise) {
    const settlement = promise.then(
      async (result) => enqueue(serverName, async () => {
        const current = await load(serverName);
        if (current.jobId !== jobId || current.status !== "preparing") {
          if (jobs.get(serverName)?.jobId === jobId) jobs.delete(serverName);
          return;
        }
        const at = timestamp(now);
        await persist({
          ...current,
          status: "succeeded",
          phase: "verified",
          message: boundedText(result?.message ?? "Pinned MCP runtime prepared and verified."),
          reasonCode: null,
          diagnostic: "",
          updatedAt: at,
          finishedAt: at,
        });
        jobs.delete(serverName);
      }),
      async (error) => enqueue(serverName, async () => {
        const current = await load(serverName);
        if (current.jobId !== jobId || current.status !== "preparing") {
          if (jobs.get(serverName)?.jobId === jobId) jobs.delete(serverName);
          return;
        }
        const aborted = error?.name === "AbortError";
        const at = timestamp(now);
        await persist({
          ...current,
          status: aborted ? "cancelled" : "failed",
          phase: aborted ? "cancelled" : "failed",
          message: aborted ? "Preparation cancelled." : "Preparation failed.",
          reasonCode: aborted ? "PREPARATION_CANCELLED" : "PREPARATION_FAILED",
          diagnostic: aborted ? "" : boundedText(error?.message ?? error),
          updatedAt: at,
          finishedAt: at,
        });
        jobs.delete(serverName);
      }),
    );
    settlement.catch(() => undefined);
    return settlement;
  }

  async function start(serverName, { retry = false } = {}) {
    if (disposed) throw new TypeError("MCP preparation controller is disposed");
    const definition = definitionFor(serverName);
    return enqueue(serverName, async () => {
      await mkdir(stateRoot, { recursive: true, mode: 0o700 });
      return withFileLock(statePath(serverName), async () => {
        const current = await load(serverName);
        if (current.status === "preparing") return structuredClone(current);
        if (retry && !new Set(["failed", "cancelled", "action_required"]).has(current.status)) {
          throw new TypeError("Retry requires a failed, cancelled, or action-required preparation");
        }
        const freeBytes = await availableBytes(stateRoot);
        if (!Number.isFinite(freeBytes) || freeBytes < definition.minimumFreeBytes) {
          const at = timestamp(now);
          return persist({
            ...current,
            status: "action_required",
            phase: "disk_space",
            message: "Free disk space is below the pinned runtime requirement.",
            reasonCode: "INSUFFICIENT_DISK_SPACE",
            diagnostic: "",
            updatedAt: at,
            finishedAt: at,
          });
        }
        const jobId = idFactory();
        const controller = new AbortController();
        const at = timestamp(now);
        const preparing = {
          ...current,
          status: "preparing",
          attempt: current.attempt + 1,
          jobId,
          phase: "starting",
          message: "Starting pinned MCP runtime preparation.",
          reasonCode: "PREPARATION_RUNNING",
          diagnostic: "",
          startedAt: at,
          updatedAt: at,
          finishedAt: null,
        };
        await persist(preparing);
        const promise = Promise.resolve().then(() => run({
          definition,
          signal: controller.signal,
          onProgress: (progress) => enqueue(serverName, () => updateJob(jobId, serverName, {
            phase: boundedText(progress?.phase, 64) || "preparing",
            message: boundedText(progress?.message, 512),
          })),
        }));
        const job = { jobId, controller, promise, settlement: null };
        jobs.set(serverName, job);
        job.settlement = settle(jobId, serverName, promise);
        return structuredClone(preparing);
      });
    });
  }

  async function cancel(serverName) {
    definitionFor(serverName);
    return enqueue(serverName, async () => {
      const current = await load(serverName);
      const job = jobs.get(serverName);
      if (current.status !== "preparing") return structuredClone(current);
      if (!job || job.jobId !== current.jobId) {
        const at = timestamp(now);
        return persist({
          ...current,
          status: "failed",
          phase: "interrupted",
          message: "The preparation process is no longer attached to this host.",
          reasonCode: "PREPARATION_INTERRUPTED",
          diagnostic: "",
          updatedAt: at,
          finishedAt: at,
        });
      }
      job.controller.abort();
      const at = timestamp(now);
      return persist({
        ...current,
        status: "cancelled",
        phase: "cancelled",
        message: "Preparation cancelled.",
        reasonCode: "PREPARATION_CANCELLED",
        diagnostic: "",
        updatedAt: at,
        finishedAt: at,
      });
    });
  }

  return Object.freeze({
    async snapshot(serverName) {
      return projectState(await load(serverName));
    },
    async execute(command) {
      if (disposed) throw new TypeError("MCP preparation controller is disposed");
      if (command === null || typeof command !== "object" || Array.isArray(command)) {
        throw new TypeError("Invalid MCP preparation command");
      }
      const keys = Object.keys(command).sort();
      if (command.action === "snapshot" && keys.join(",") === "action,serverName") {
        return this.snapshot(command.serverName);
      }
      if (command.action === "prepare" && keys.join(",") === "action,serverName") {
        return projectState(await start(command.serverName));
      }
      if (command.action === "retry" && keys.join(",") === "action,serverName") {
        return projectState(await start(command.serverName, { retry: true }));
      }
      if (command.action === "cancel" && keys.join(",") === "action,serverName") {
        return projectState(await cancel(command.serverName));
      }
      throw new TypeError("Unknown MCP preparation command");
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of jobs.values()) job.controller.abort();
      await Promise.allSettled([...jobs.values()].map((job) => job.settlement));
    },
  });
}
