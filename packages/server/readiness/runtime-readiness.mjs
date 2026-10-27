const DEFAULT_PRESET_ID = "flagqai";
const DEFAULT_TIMEOUT_MS = 1_500;

const LIMITATIONS = Object.freeze([
  "MODEL_ENDPOINT_REACHABILITY_NOT_CHECKED",
  "MCP_CONNECTION_STATE_NOT_CHECKED",
  "DOWNSTREAM_SERVICE_REACHABILITY_NOT_CHECKED",
]);

function requiredFunction(target, name) {
  if (typeof target?.[name] !== "function") {
    throw new TypeError(`Runtime readiness observer requires ${name}()`);
  }
}

function normalizeTimeout(timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new TypeError("Runtime readiness timeoutMs must be between 1 and 10000");
  }
  return timeoutMs;
}

function normalizeIdentifier(value) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized === "" || normalized.length > 256) return undefined;
  return normalized;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function normalizeNamedItems(values, { label = false } = {}) {
  if (!Array.isArray(values)) return undefined;
  const byId = new Map();
  for (const value of values) {
    const id = normalizeIdentifier(value?.id ?? value?.name);
    if (id === undefined) continue;
    const item = { id };
    const itemLabel = label ? normalizeIdentifier(value?.name) : undefined;
    if (itemLabel !== undefined && itemLabel !== id) item.label = itemLabel;
    byId.set(id, item);
  }
  return [...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function toolGroups(items) {
  const grouped = new Map();
  for (const item of items) {
    if (!item.id.startsWith("mcp__")) continue;
    const [, serverId] = item.id.split("__", 3);
    if (!serverId) continue;
    const names = grouped.get(serverId) ?? [];
    names.push(item.id);
    grouped.set(serverId, names);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, names]) => ({
      id,
      itemCount: names.length,
      items: sortedUnique(names).map((name) => ({ id: name })),
    }));
}

function normalizeLifecycleServers(mcpServers) {
  if (mcpServers === undefined) return [];
  if (!Array.isArray(mcpServers)) {
    throw new TypeError("Runtime readiness mcpServers must be an array");
  }
  return mcpServers.flatMap((server) => {
    const serverName = normalizeIdentifier(server?.serverName);
    const displayName = normalizeIdentifier(server?.displayName);
    const lifecycle = server?.lifecycle;
    if (
      serverName === undefined ||
      displayName === undefined ||
      lifecycle?.preparation !== "heavyweight"
    ) {
      return [];
    }
    if (!Array.isArray(lifecycle.expectedTools) || lifecycle.expectedTools.length === 0) {
      throw new TypeError(`Runtime readiness ${serverName} requires expectedTools`);
    }
    const expectedTools = sortedUnique(
      lifecycle.expectedTools.map(normalizeIdentifier),
    );
    if (expectedTools.length !== lifecycle.expectedTools.length) {
      throw new TypeError(`Runtime readiness ${serverName} expectedTools are invalid`);
    }
    return [{
      serverName,
      displayName,
      enabled: server.enabled === true,
      expectedTools,
      preparation: server.preparation === undefined
        ? null
        : structuredClone(server.preparation),
    }];
  });
}

function normalizeCapabilityPackages(capabilityPackages) {
  if (capabilityPackages === undefined) return [];
  if (!Array.isArray(capabilityPackages)) {
    throw new TypeError("Runtime readiness capabilityPackages must be an array");
  }
  const seen = new Set();
  return capabilityPackages.map((entry, index) => {
    const id = normalizeIdentifier(entry?.id);
    const contract = entry?.registryContract;
    if (
      id === undefined ||
      seen.has(id) ||
      contract === null ||
      typeof contract !== "object" ||
      Array.isArray(contract) ||
      !Array.isArray(contract.skills) ||
      !Array.isArray(contract.tools)
    ) {
      throw new TypeError(`Runtime readiness capabilityPackages[${index}] is invalid`);
    }
    seen.add(id);
    const normalizeItems = (items, kind) => items.map((item, itemIndex) => {
      const itemId = normalizeIdentifier(item?.id);
      if (itemId === undefined || typeof item.required !== "boolean") {
        throw new TypeError(`Runtime readiness ${id}.${kind}[${itemIndex}] is invalid`);
      }
      return { id: itemId, required: item.required };
    });
    const skills = normalizeItems(contract.skills, "skills");
    const tools = normalizeItems(contract.tools, "tools");
    if (new Set(skills.map((item) => item.id)).size !== skills.length ||
        new Set(tools.map((item) => item.id)).size !== tools.length) {
      throw new TypeError(`Runtime readiness ${id} registry contract has duplicates`);
    }
    return { id, skills, tools };
  });
}

function projectCapabilityPackages(capabilityPackages, preset, checks) {
  const skillCheck = checks.find((check) => check.id === "skill-registry");
  const toolCheck = checks.find((check) => check.id === "tool-registry");
  const observedSkills = new Set(skillCheck.items.map((item) => item.id));
  const observedTools = new Set(toolCheck.items.map((item) => item.id));
  return capabilityPackages.map((entry) => {
    const declared = [...entry.skills, ...entry.tools];
    const required = declared.filter((item) => item.required);
    const observedItemCount = entry.skills.filter((item) => observedSkills.has(item.id)).length +
      entry.tools.filter((item) => observedTools.has(item.id)).length;
    const observedRequiredItemCount = entry.skills.filter((item) => item.required && observedSkills.has(item.id)).length +
      entry.tools.filter((item) => item.required && observedTools.has(item.id)).length;
    const missingRequiredItemCount = entry.skills.filter((item) => item.required && !observedSkills.has(item.id)).length +
      entry.tools.filter((item) => item.required && !observedTools.has(item.id)).length;
    const missingRequiredItems = [
      ...entry.skills
        .filter((item) => item.required && !observedSkills.has(item.id))
        .map((item) => ({ kind: "skill", id: item.id })),
      ...entry.tools
        .filter((item) => item.required && !observedTools.has(item.id))
        .map((item) => ({ kind: "tool", id: item.id })),
    ].sort((left, right) =>
      left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
    );
    const projection = {
      id: entry.id,
      state: "incomplete",
      declaredItemCount: declared.length,
      requiredItemCount: required.length,
      observedItemCount,
      observedRequiredItemCount,
      missingRequiredItemCount,
      missingRequiredItems: [],
      nextActions: [],
      reasonCodes: [],
    };
    if (preset.state === "not_observed") {
      projection.state = "not_observed";
      projection.nextActions.push("START_FLAGQAI_SESSION");
      projection.reasonCodes.push("PRESET_NOT_MOUNTED");
      return projection;
    }
    if (preset.state === "failed") {
      projection.state = "failed";
      projection.nextActions.push("RETRY_RUNTIME_OBSERVATION");
      projection.reasonCodes.push("PRESET_REGISTRY_READ_FAILED");
      return projection;
    }
    const relevantChecks = [
      ...(entry.skills.length > 0 ? [skillCheck] : []),
      ...(entry.tools.length > 0 ? [toolCheck] : []),
    ];
    if (relevantChecks.some((check) => check.state === "failed" || check.state === "not_observed")) {
      projection.state = "failed";
      projection.nextActions.push("RETRY_RUNTIME_OBSERVATION");
      projection.reasonCodes.push("PACKAGE_REGISTRY_OBSERVATION_FAILED");
      return projection;
    }
    if (preset.state !== "observed") {
      projection.nextActions.push("START_FRESH_FLAGQAI_SESSION");
      projection.reasonCodes.push("PRESET_OBSERVATION_INCOMPLETE");
    }
    if (relevantChecks.some((check) => check.state !== "observed")) {
      projection.nextActions.push("RETRY_RUNTIME_OBSERVATION");
      projection.reasonCodes.push("PACKAGE_REGISTRY_OBSERVATION_INCOMPLETE");
    }
    if (
      missingRequiredItemCount > 0 &&
      preset.state === "observed" &&
      relevantChecks.every((check) => check.state === "observed")
    ) {
      projection.missingRequiredItems = missingRequiredItems;
      if (missingRequiredItems.some((item) => item.kind === "skill")) {
        projection.nextActions.push("RESTORE_SKILL_PROVIDER");
      }
      if (missingRequiredItems.some((item) => item.kind === "tool")) {
        projection.nextActions.push("RESTORE_TOOL_PROVIDER");
      }
      projection.reasonCodes.push("REQUIRED_REGISTRY_ITEMS_MISSING");
    }
    projection.nextActions = sortedUnique(projection.nextActions);
    if (projection.reasonCodes.length === 0) projection.state = "observed";
    return projection;
  });
}

function projectMcpLifecycles(mcpServers, preset, toolCheck) {
  const observedToolIds = new Set(toolCheck.items.map((item) => item.id));
  return mcpServers.map((server) => {
    const prefix = `mcp__${server.serverName}__`;
    const expectedToolIds = server.expectedTools.map((name) => `${prefix}${name}`);
    const observedServerToolIds = [...observedToolIds]
      .filter((name) => name.startsWith(prefix))
      .sort((left, right) => left.localeCompare(right));
    const missingToolCount = expectedToolIds.filter(
      (name) => !observedToolIds.has(name),
    ).length;
    const unexpectedToolCount = observedServerToolIds.filter(
      (name) => !expectedToolIds.includes(name),
    ).length;
    const projection = {
      serverName: server.serverName,
      displayName: server.displayName,
      enabled: server.enabled,
      state: "failed",
      observedToolCount: observedServerToolIds.length,
      expectedToolCount: expectedToolIds.length,
      missingToolCount,
      unexpectedToolCount,
      reasonCodes: [],
      preparation: server.preparation,
    };

    const contractReady =
      server.enabled &&
      preset.state === "observed" &&
      !new Set(["failed", "not_observed"]).has(toolCheck.state) &&
      observedServerToolIds.length > 0 &&
      missingToolCount === 0 &&
      unexpectedToolCount === 0;
    if (contractReady) {
      projection.state = "ready";
      return projection;
    }
    if (server.preparation?.status === "preparing") {
      projection.state = "preparing";
      projection.reasonCodes.push("PREPARATION_RUNNING");
      return projection;
    }
    if (server.preparation?.status === "failed") {
      projection.reasonCodes.push(
        server.preparation.reasonCode ?? "PREPARATION_FAILED",
      );
      return projection;
    }
    if (
      server.preparation?.status === "cancelled" ||
      server.preparation?.status === "action_required"
    ) {
      projection.state = "action_required";
      projection.reasonCodes.push(
        server.preparation.reasonCode ?? "PREPARATION_REQUIRED",
      );
      return projection;
    }
    if (server.preparation?.status === "succeeded") {
      projection.state = "action_required";
      projection.reasonCodes.push(
        server.enabled ? "START_NEW_SESSION_TO_LOAD" : "ENABLE_FOR_NEW_SESSIONS",
      );
      return projection;
    }

    if (!server.enabled) {
      projection.state = "disabled";
      projection.reasonCodes.push("DISABLED_BY_POLICY");
      if (observedServerToolIds.length > 0) {
        projection.reasonCodes.push("TOOLS_STILL_OBSERVED");
      }
      return projection;
    }
    if (preset.state === "not_observed") {
      projection.state = "action_required";
      projection.reasonCodes.push("PRESET_NOT_MOUNTED");
      return projection;
    }
    if (toolCheck.state === "failed" || toolCheck.state === "not_observed") {
      projection.reasonCodes.push("TOOL_REGISTRY_OBSERVATION_FAILED");
      return projection;
    }
    if (observedServerToolIds.length === 0) {
      projection.reasonCodes.push("TOOLS_NOT_OBSERVED");
      return projection;
    }
    if (missingToolCount > 0 || unexpectedToolCount > 0) {
      projection.reasonCodes.push("TOOL_CONTRACT_MISMATCH");
      return projection;
    }
    throw new Error("MCP lifecycle contract readiness projection is inconsistent");
  });
}

async function boundedObservation(read, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reasonCode: "OBSERVATION_TIMEOUT" });
    }, timeoutMs);
  });
  const observation = Promise.resolve()
    .then(() => read(controller.signal))
    .then(
      (value) => ({ ok: true, value }),
      () => ({ ok: false, reasonCode: "OBSERVATION_FAILED" }),
    );
  try {
    return await Promise.race([observation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function failedCheck(id, scope, reasonCode) {
  return {
    id,
    scope,
    state: "failed",
    itemCount: 0,
    items: [],
    reasonCodes: [reasonCode],
  };
}

function notObservedCheck(id) {
  return {
    id,
    scope: "preset",
    state: "not_observed",
    itemCount: 0,
    items: [],
    reasonCodes: ["PRESET_NOT_MOUNTED"],
  };
}

function aggregateSkillCheck(results) {
  const successful = results.filter((result) => result.ok);
  if (successful.length === 0) {
    const timedOut = results.some(
      (result) => result.reasonCode === "OBSERVATION_TIMEOUT",
    );
    return failedCheck(
      "skill-registry",
      "preset",
      timedOut ? "SKILL_REGISTRY_TIMEOUT" : "SKILL_REGISTRY_READ_FAILED",
    );
  }

  const valid = successful.filter(
    (result) =>
      Array.isArray(result.value?.skills) &&
      typeof result.value.complete === "boolean",
  );
  if (valid.length === 0) {
    return failedCheck(
      "skill-registry",
      "preset",
      "SKILL_REGISTRY_INVALID_OBSERVATION",
    );
  }
  const items = normalizeNamedItems(
    valid.flatMap((result) => result.value.skills),
  );
  const reasonCodes = [];
  if (successful.length !== results.length) {
    reasonCodes.push("SKILL_REGISTRY_GENERATION_FAILED");
  }
  if (valid.length !== successful.length) {
    reasonCodes.push("SKILL_REGISTRY_GENERATION_INVALID");
  }
  if (valid.some((result) => result.value.complete !== true)) {
    reasonCodes.push("SKILL_CATALOG_INCOMPLETE");
  }
  if (items.length === 0) reasonCodes.push("NO_SKILLS_OBSERVED");
  return {
    id: "skill-registry",
    scope: "preset",
    state: reasonCodes.length === 0 ? "observed" : "incomplete",
    itemCount: items.length,
    items,
    reasonCodes,
  };
}

function aggregateToolCheck(results) {
  const successful = results.filter((result) => result.ok);
  if (successful.length === 0) {
    const timedOut = results.some(
      (result) => result.reasonCode === "OBSERVATION_TIMEOUT",
    );
    return failedCheck(
      "tool-registry",
      "preset",
      timedOut ? "TOOL_REGISTRY_TIMEOUT" : "TOOL_REGISTRY_READ_FAILED",
    );
  }

  const valid = successful.filter((result) => Array.isArray(result.value));
  if (valid.length === 0) {
    return failedCheck(
      "tool-registry",
      "preset",
      "TOOL_REGISTRY_INVALID_OBSERVATION",
    );
  }
  const items = normalizeNamedItems(valid.flatMap((result) => result.value));
  const reasonCodes = [];
  if (successful.length !== results.length) {
    reasonCodes.push("TOOL_REGISTRY_GENERATION_FAILED");
  }
  if (valid.length !== successful.length) {
    reasonCodes.push("TOOL_REGISTRY_GENERATION_INVALID");
  }
  if (items.length === 0) reasonCodes.push("NO_TOOLS_OBSERVED");
  return {
    id: "tool-registry",
    scope: "preset",
    state: reasonCodes.length === 0 ? "observed" : "incomplete",
    itemCount: items.length,
    items,
    groups: toolGroups(items),
    reasonCodes,
  };
}

async function observeModelRoutes(observer, timeoutMs) {
  const result = await boundedObservation(
    () => observer.listModelRoutes(),
    timeoutMs,
  );
  if (!result.ok) {
    return failedCheck(
      "model-routes",
      "host",
      result.reasonCode === "OBSERVATION_TIMEOUT"
        ? "MODEL_ROUTE_REGISTRY_TIMEOUT"
        : "MODEL_ROUTE_REGISTRY_READ_FAILED",
    );
  }
  const items = normalizeNamedItems(result.value, { label: true });
  if (items === undefined) {
    return failedCheck(
      "model-routes",
      "host",
      "MODEL_ROUTE_REGISTRY_INVALID_OBSERVATION",
    );
  }
  return {
    id: "model-routes",
    scope: "host",
    state: items.length === 0 ? "incomplete" : "observed",
    itemCount: items.length,
    items,
    reasonCodes: items.length === 0 ? ["NO_MODEL_ROUTES_OBSERVED"] : [],
  };
}

async function observePreset(observer, presetId, timeoutMs) {
  const scopeResult = await boundedObservation(
    () => observer.listActivePresetScopes(presetId),
    timeoutMs,
  );
  if (!scopeResult.ok || !Array.isArray(scopeResult.value)) {
    const reasonCode = scopeResult.reasonCode === "OBSERVATION_TIMEOUT"
      ? "PRESET_REGISTRY_TIMEOUT"
      : "PRESET_REGISTRY_READ_FAILED";
    return {
      preset: {
        id: presetId,
        state: "failed",
        generationCount: 0,
        reasonCodes: [reasonCode],
      },
      checks: [
        failedCheck("skill-registry", "preset", reasonCode),
        failedCheck("tool-registry", "preset", reasonCode),
      ],
    };
  }

  const scopes = [...new Set(scopeResult.value)];
  if (scopes.length === 0) {
    return {
      preset: {
        id: presetId,
        state: "not_observed",
        generationCount: 0,
        reasonCodes: ["PRESET_NOT_MOUNTED"],
      },
      checks: [
        notObservedCheck("skill-registry"),
        notObservedCheck("tool-registry"),
      ],
    };
  }

  const observations = await Promise.all(scopes.map(async (scope) => {
    const [skills, tools] = await Promise.all([
      boundedObservation(
        (signal) => observer.listSkills(scope, { signal }),
        timeoutMs,
      ),
      boundedObservation(
        () => observer.listTools(scope),
        timeoutMs,
      ),
    ]);
    return { skills, tools };
  }));
  const multiple = scopes.length > 1;
  return {
    preset: {
      id: presetId,
      state: multiple ? "multiple_generations" : "observed",
      generationCount: scopes.length,
      reasonCodes: multiple ? ["MULTIPLE_PRESET_GENERATIONS"] : [],
    },
    checks: [
      aggregateSkillCheck(observations.map((entry) => entry.skills)),
      aggregateToolCheck(observations.map((entry) => entry.tools)),
    ],
  };
}

function overallStatus(preset, checks) {
  if (checks.some((check) => check.scope === "host" && check.state !== "observed")) {
    return "partial";
  }
  if (preset.state === "not_observed") return "not_observed";
  if (
    preset.state !== "observed" ||
    checks.some((check) => check.state !== "observed")
  ) {
    return "partial";
  }
  return "observed";
}

/**
 * Create the one read-only Runtime Readiness Application Interface.
 *
 * The injected observer owns Harness-specific scope addressing. Reading never
 * mounts a preset, starts an MCP Server, executes a Tool, calls a model, or
 * reads a credential value.
 */
export function createRuntimeReadinessReader({
  observer,
  mcpServers,
  capabilityPackages,
  presetId = DEFAULT_PRESET_ID,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
} = {}) {
  requiredFunction(observer, "listActivePresetScopes");
  requiredFunction(observer, "listSkills");
  requiredFunction(observer, "listTools");
  requiredFunction(observer, "listModelRoutes");
  const boundedTimeoutMs = normalizeTimeout(timeoutMs);
  const boundedMcpServers = normalizeLifecycleServers(mcpServers);
  const boundedCapabilityPackages = normalizeCapabilityPackages(capabilityPackages);
  const boundedPresetId = normalizeIdentifier(presetId);
  if (boundedPresetId === undefined) {
    throw new TypeError("Runtime readiness presetId is invalid");
  }

  return async function readRuntimeReadiness() {
    const [modelCheck, presetObservation] = await Promise.all([
      observeModelRoutes(observer, boundedTimeoutMs),
      observePreset(observer, boundedPresetId, boundedTimeoutMs),
    ]);
    const observedAt = now();
    if (!(observedAt instanceof Date) || Number.isNaN(observedAt.valueOf())) {
      throw new TypeError("Runtime readiness clock returned an invalid date");
    }
    const checks = [modelCheck, ...presetObservation.checks];
    const toolCheck = checks.find((check) => check.id === "tool-registry");
    return {
      schemaVersion: "1.4",
      observedAt: observedAt.toISOString(),
      mode: "passive",
      status: overallStatus(presetObservation.preset, checks),
      preset: presetObservation.preset,
      checks,
      mcpLifecycles: projectMcpLifecycles(
        boundedMcpServers,
        presetObservation.preset,
        toolCheck,
      ),
      capabilityPackages: projectCapabilityPackages(
        boundedCapabilityPackages,
        presetObservation.preset,
        checks,
      ),
      limitations: [...LIMITATIONS],
    };
  };
}
