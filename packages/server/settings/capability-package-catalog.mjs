import { parseDocument } from "yaml";

const LEVELS = Object.freeze(["L0", "L1", "L2", "L3"]);
const CAPABILITY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REGISTRY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ACTIVATIONS = new Set(["always", "conditional", "opt-in"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function registryItem(value, context, activation) {
  if (!isRecord(value) || typeof value.name !== "string" || !REGISTRY_ID.test(value.name)) {
    throw new TypeError(`${context} 无效`);
  }
  if (!ACTIVATIONS.has(activation)) {
    throw new TypeError(`${context}.activation 无效`);
  }
  return { id: value.name, required: activation === "always" };
}

function executionSummary(definition, skill) {
  const skillItems = skill === undefined ? [] : [{ id: definition.id, required: true }];
  if (definition.level === "L0") {
    return {
      mcpServerCount: 0,
      nativeToolCount: 0,
      toolCount: 0,
      registryContract: { skills: skillItems, tools: [] },
    };
  }
  if (!isRecord(definition.execution)) {
    throw new TypeError(`${definition.id}.execution 必须是对象`);
  }
  const mcpServers = definition.execution.mcpServers;
  const nativeTools = definition.execution.nativeTools;
  if (!Array.isArray(mcpServers) || !Array.isArray(nativeTools)) {
    throw new TypeError(`${definition.id}.execution 必须声明 MCP Server 与原生 Tool 数组`);
  }
  let mcpToolCount = 0;
  const toolItems = [];
  for (const [index, server] of mcpServers.entries()) {
    if (
      !isRecord(server) ||
      typeof server.name !== "string" ||
      !REGISTRY_ID.test(server.name) ||
      !ACTIVATIONS.has(server.activation) ||
      !Array.isArray(server.tools)
    ) {
      throw new TypeError(`${definition.id}.execution.mcpServers[${index}] 无效`);
    }
    for (const [toolIndex, tool] of server.tools.entries()) {
      const item = registryItem(
        tool,
        `${definition.id}.execution.mcpServers[${index}].tools[${toolIndex}]`,
        server.activation,
      );
      toolItems.push({
        id: `mcp__${server.name}__${item.id}`,
        required: item.required,
      });
      mcpToolCount += 1;
    }
  }
  for (const [index, tool] of nativeTools.entries()) {
    toolItems.push(registryItem(
      tool,
      `${definition.id}.execution.nativeTools[${index}]`,
      tool.activation,
    ));
  }
  return {
    mcpServerCount: mcpServers.length,
    nativeToolCount: nativeTools.length,
    toolCount: mcpToolCount + nativeTools.length,
    registryContract: { skills: skillItems, tools: toolItems },
  };
}

export function projectCapabilityPackageCatalog(source, skills = []) {
  if (typeof source !== "string") {
    throw new TypeError("Capability Package 策略必须是 YAML 文本");
  }
  if (!Array.isArray(skills)) {
    throw new TypeError("Capability Package Skill 目录必须是数组");
  }
  const document = parseDocument(source, {
    schema: "core",
    strict: true,
    uniqueKeys: true,
    merge: false,
  });
  if (document.errors.length > 0) throw document.errors[0];
  const policy = document.toJS({ maxAliasCount: 20, mapAsMap: false });
  if (!isRecord(policy) || policy.schemaVersion !== "1.1" || !Array.isArray(policy.packages)) {
    throw new TypeError("Capability Package 策略必须符合 1.1 目录结构");
  }
  const skillByName = new Map(skills.map((skill) => [skill.name, skill]));
  const seen = new Set();
  return policy.packages.map((definition, index) => {
    if (
      !isRecord(definition) ||
      typeof definition.id !== "string" ||
      !CAPABILITY_ID.test(definition.id) ||
      !LEVELS.includes(definition.level)
    ) {
      throw new TypeError(`Capability Package packages[${index}] 无效`);
    }
    if (seen.has(definition.id)) {
      throw new TypeError(`Capability Package 重复声明 ${definition.id}`);
    }
    seen.add(definition.id);
    const skill = skillByName.get(definition.id);
    return {
      id: definition.id,
      level: definition.level,
      displayName: skill?.displayName ?? definition.id,
      description: skill?.description ?? null,
      hasSkill: skill !== undefined,
      audited: definition.level === "L2" || definition.level === "L3",
      materialized: definition.level === "L3",
      ...executionSummary(definition, skill),
    };
  });
}
