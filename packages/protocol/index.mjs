export const FLAGQAI_PROTOCOL_VERSION = "2026-10-14.1";
export const FLAGQAI_API_PREFIX = "/v1";

export const MESSAGE_PLACEMENTS = Object.freeze([
  "turn",
  "steer",
  "followup",
  "now",
]);

export const CANCEL_CAUSES = Object.freeze([
  "user",
  "interrupt",
  "switch",
  "dispose",
]);

export const PERMISSION_DECISIONS = Object.freeze([
  "allow-once",
  "allow-always",
  "reject",
]);

export const PROVIDER_PROTOCOLS = Object.freeze([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
]);

const PROVIDER_ROUTE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProtocolInputError(`${name} must be a non-empty string`);
  }
  return value;
};

const optionalString = (value, name) => {
  if (value === undefined) return undefined;
  return requiredString(value, name);
};

const optionalBoundedString = (value, name, maxLength) => {
  if (value === undefined) return undefined;
  const text = requiredString(value, name);
  if ([...text].length > maxLength) {
    throw new ProtocolInputError(`${name} must be at most ${maxLength} characters`);
  }
  return text;
};

const providerUrl = (value, required) => {
  if (value === undefined && !required) return undefined;
  const text = optionalBoundedString(value, "baseURL", 2_048);
  if (text === undefined) throw new ProtocolInputError("baseURL is required for a custom provider");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ProtocolInputError("baseURL must be a valid URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "") {
    throw new ProtocolInputError("baseURL must use HTTP or HTTPS and must not contain credentials");
  }
  url.hash = "";
  url.search = "";
  return url.href.replace(/\/$/, "");
};

const providerDraft = (value, { configure }) => {
  if (!isRecord(value)) throw new ProtocolInputError("request body must be an object");
  const kind = value.kind;
  if (kind !== "catalog" && kind !== "custom") {
    throw new ProtocolInputError('kind must be "catalog" or "custom"');
  }
  const route = requiredString(value.route, "route");
  if (!PROVIDER_ROUTE_ID.test(route)) {
    throw new ProtocolInputError("route must start with a lowercase letter and contain lowercase letters, numbers, or hyphens");
  }
  const baseURL = providerUrl(value.baseURL, kind === "custom");
  const api = value.api === undefined ? undefined : requiredString(value.api, "api");
  if (api !== undefined && !PROVIDER_PROTOCOLS.includes(api)) {
    throw new ProtocolInputError(`api must be one of ${PROVIDER_PROTOCOLS.join(", ")}`);
  }
  if (kind === "custom" && api === undefined) throw new ProtocolInputError("api is required for a custom provider");
  const apiKey = optionalBoundedString(value.apiKey, "apiKey", 16_384);
  const models = value.models === undefined ? [] : value.models;
  if (!Array.isArray(models) || models.length > 256 || (configure && models.length === 0)) {
    throw new ProtocolInputError(configure
      ? "models must contain from 1 through 256 model ids"
      : "models must be an array with at most 256 model ids");
  }
  const parsedModels = models.map((model, index) => optionalBoundedString(model, `models[${index}]`, 512));
  if (parsedModels.some(model => model === undefined) || new Set(parsedModels).size !== parsedModels.length) {
    throw new ProtocolInputError("models must contain unique non-empty strings");
  }
  const allowed = configure
    ? ["kind", "route", "baseURL", "api", "apiKey", "models"]
    : ["kind", "route", "baseURL", "api", "apiKey"];
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new ProtocolInputError("request body contains unknown fields");
  }
  return {
    kind,
    route,
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(api === undefined ? {} : { api }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(configure ? { models: parsedModels } : {}),
  };
};

export class ProtocolInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProtocolInputError";
    this.code = "invalid_request";
  }
}

export function parseCreateSessionRequest(value) {
  if (!isRecord(value)) throw new ProtocolInputError("request body must be an object");
  const backendId = requiredString(value.backendId, "backendId");
  const cwd = requiredString(value.cwd, "cwd");
  const sessionId = optionalString(value.sessionId, "sessionId");
  const keys = Object.keys(value);
  if (keys.some((key) => !["backendId", "cwd", "sessionId"].includes(key))) {
    throw new ProtocolInputError("request body contains unknown fields");
  }
  return sessionId === undefined
    ? { backendId, target: { kind: "create", cwd } }
    : { backendId, target: { kind: "resume", sessionId, cwd } };
}

export function parseModelSelection(value) {
  if (!isRecord(value) || Object.keys(value).some(key => !["provider", "model"].includes(key))) {
    throw new ProtocolInputError("model selection must contain only provider and model");
  }
  return { ...(value.provider === undefined ? {} : { provider: optionalBoundedString(value.provider, "provider", 512) }), model: optionalBoundedString(value.model, "model", 512) ?? requiredString(value.model, "model") };
}

export function parseMessageRequest(value) {
  if (!isRecord(value)) throw new ProtocolInputError("request body must be an object");
  const clientMessageId = requiredString(value.clientMessageId, "clientMessageId");
  const text = requiredString(value.text, "text");
  const placement = value.placement ?? "turn";
  if (!MESSAGE_PLACEMENTS.includes(placement)) {
    throw new ProtocolInputError(`placement must be one of ${MESSAGE_PLACEMENTS.join(", ")}`);
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !["clientMessageId", "text", "placement", "images"].includes(key))) {
    throw new ProtocolInputError("request body contains unknown fields");
  }
  const images = value.images ?? [];
  if (!Array.isArray(images) || images.length > 4) throw new ProtocolInputError("images must contain at most four entries");
  let totalImageBytes = 0;
  for (const image of images) {
    if (!isRecord(image) || Object.keys(image).some(key => !["name", "mediaType", "data"].includes(key))
      || typeof image.name !== "string" || image.name.length > 256
      || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(image.mediaType)
      || typeof image.data !== "string" || image.data.length > 2800000 || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data) || !image.data.length) {
      throw new ProtocolInputError("invalid image attachment");
    }
    const bytes = image.data.length / 4 * 3 - (image.data.endsWith("==") ? 2 : image.data.endsWith("=") ? 1 : 0);
    if (bytes > 2 * 1024 * 1024 || (totalImageBytes += bytes) > 4 * 1024 * 1024) throw new ProtocolInputError("image attachments exceed their size limit");
  }
  return {
    images,
    input: {
      clientMessageId,
      blocks: [{ type: "text", text }],
      text,
    },
    placement,
  };
}

export function parseCancelRequest(value) {
  if (value === undefined) return { cause: "user" };
  if (!isRecord(value)) throw new ProtocolInputError("request body must be an object");
  const cause = value.cause ?? "user";
  if (!CANCEL_CAUSES.includes(cause)) {
    throw new ProtocolInputError(`cause must be one of ${CANCEL_CAUSES.join(", ")}`);
  }
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "cause")) {
    throw new ProtocolInputError("request body contains unknown fields");
  }
  return { cause };
}

export function parsePermissionResponse(value) {
  if (!isRecord(value)) throw new ProtocolInputError("request body must be an object");
  const kind = requiredString(value.kind, "kind");
  if (!PERMISSION_DECISIONS.includes(kind)) {
    throw new ProtocolInputError(`kind must be one of ${PERMISSION_DECISIONS.join(", ")}`);
  }
  const optionId = optionalBoundedString(value.optionId, "optionId", 256);
  const message = optionalBoundedString(value.message, "message", 4_000);
  const keys = Object.keys(value);
  if (keys.some((key) => !["kind", "optionId", "message"].includes(key))) {
    throw new ProtocolInputError("request body contains unknown fields");
  }
  if (kind === "allow-once" && (optionId !== undefined || message !== undefined)) {
    throw new ProtocolInputError("allow-once does not accept optionId or message");
  }
  if (kind === "allow-always" && message !== undefined) {
    throw new ProtocolInputError("allow-always does not accept message");
  }
  if (kind === "reject" && optionId !== undefined) {
    throw new ProtocolInputError("reject does not accept optionId");
  }
  return {
    kind,
    ...(optionId === undefined ? {} : { optionId }),
    ...(message === undefined ? {} : { message }),
  };
}

export function parseQuestionResponse(value) {
  if (!isRecord(value)) throw new ProtocolInputError("request body must be an object");
  if (!Array.isArray(value.answers) || value.answers.length === 0 || value.answers.length > 64) {
    throw new ProtocolInputError("answers must contain from 1 through 64 items");
  }
  if (Object.keys(value).some((key) => key !== "answers")) {
    throw new ProtocolInputError("request body contains unknown fields");
  }
  return {
    answers: value.answers.map((answer, index) => {
      if (!isRecord(answer)) throw new ProtocolInputError(`answers[${index}] must be an object`);
      if (!Array.isArray(answer.selected) || answer.selected.length > 64) {
        throw new ProtocolInputError(`answers[${index}].selected must be an array with at most 64 items`);
      }
      const selected = answer.selected.map((item, selectedIndex) =>
        optionalBoundedString(item, `answers[${index}].selected[${selectedIndex}]`, 1_000));
      if (selected.some((item) => item === undefined)) {
        throw new ProtocolInputError(`answers[${index}].selected must contain non-empty strings`);
      }
      const custom = optionalBoundedString(answer.custom, `answers[${index}].custom`, 8_000);
      if (Object.keys(answer).some((key) => !["selected", "custom"].includes(key))) {
        throw new ProtocolInputError(`answers[${index}] contains unknown fields`);
      }
      return {
        selected,
        ...(custom === undefined ? {} : { custom }),
      };
    }),
  };
}

export function parseProviderDiscoveryRequest(value) {
  return providerDraft(value, { configure: false });
}

export function parseProviderConfigurationRequest(value) {
  return providerDraft(value, { configure: true });
}

export function parseSessionAction(value, { fork = false } = {}) {
  if (!isRecord(value) || Object.keys(value).some(key => !['title', ...(fork ? ['anchor'] : [])].includes(key))) {
    throw new ProtocolInputError('invalid session action');
  }
  const title = fork ? optionalBoundedString(value.title, 'title', 256) : optionalBoundedString(requiredString(value.title, 'title'), 'title', 256);
  return { ...(title === undefined ? {} : { title: title.trim() }), ...(fork && value.anchor !== undefined ? { anchor: optionalBoundedString(value.anchor, 'anchor', 512) } : {}) };
}

export function sessionResource(id, session) {
  return {
    id,
    backendId: session.ref.backendId,
    sessionId: session.ref.sessionId,
    cwd: session.cwd,
    status: session.status,
    capabilities: Object.keys(session.capabilities ?? {}).sort(),
  };
}

export function sessionCatalogResource(summary, state = {}) {
  const title = typeof summary?.title?.text === "string" && summary.title.text.trim() !== ""
    ? summary.title.text
    : "Untitled session";
  const kind = typeof summary?.kind?.kind === "string" ? summary.kind.kind : "root";
  return {
    backendId: summary.backendId,
    sessionId: summary.id,
    title,
    titleSource: typeof summary?.title?.source === "string" ? summary.title.source : "fallback",
    kind,
    cwd: typeof summary.cwd === "string" ? summary.cwd : "",
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    ...(typeof summary.model === "string" ? { model: summary.model } : {}),
    ...(typeof summary.branch === "string" ? { branch: summary.branch } : {}),
    availability: state.resourceId === undefined
      ? state.occupancy === "free" ? "available" : "occupied"
      : "active",
    ...(state.resourceId === undefined ? {} : { resourceId: state.resourceId }),
    ...(Number.isInteger(state.pid) ? { ownerPid: state.pid } : {}),
  };
}

export function errorResource(error) {
  const code = typeof error?.code === "string" ? error.code : "internal_error";
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return { error: { code, message } };
}

export const FLAGQAI_OPENAPI = Object.freeze({
  openapi: "3.1.0",
  info: {
    title: "FlagQAI local service",
    version: FLAGQAI_PROTOCOL_VERSION,
    description: "Loopback API over the authoritative agent-session event stream.",
  },
  servers: [{ url: "http://127.0.0.1:4096" }],
  paths: {
    "/v1/health": { get: { operationId: "getHealth", responses: { 200: { description: "Service health" } } } },
    "/v1/backends": { get: { operationId: "listBackends", responses: { 200: { description: "Backend catalog" } } } },
    "/v1/providers": {
      get: { operationId: "listProviders", responses: { 200: { description: "Masked provider setup state" } } },
      post: { operationId: "configureProvider", responses: { 201: { description: "Configured provider" } } },
    },
    "/v1/providers/discover": { post: { operationId: "discoverProviderModels", responses: { 200: { description: "Draft provider model discovery" } } } },
    "/v1/sessions": {
      get: { operationId: "listSessions", responses: { 200: { description: "Durable and active sessions" } } },
      post: { operationId: "openSession", responses: { 201: { description: "Opened session" } } },
    },
    "/v1/sessions/{id}": {
      get: { operationId: "getSession", responses: { 200: { description: "Session state" } } },
      delete: { operationId: "disposeSession", responses: { 204: { description: "Disposed session" } } },
    },
    "/v1/sessions/{id}/plan": {
      post: { operationId: "setSessionPlan", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["active"], properties: { active: { type: "boolean" } } } } } }, responses: { 200: { description: "Backend-confirmed plan and permission state" }, 400: { description: "Invalid plan selection" }, 409: { description: "Unavailable, busy or unconfirmed change" } } },
    },
    "/v1/sessions/{id}/controls": {
      get: { operationId: "getSessionControls", responses: { 200: { description: "Native effort and mode options with current readback and availability" } } },
      post: { operationId: "setSessionControl", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["kind", "id"], properties: { kind: { type: "string", enum: ["effort", "mode"] }, id: { type: ["string", "null"] } } } } } }, responses: { 200: { description: "Backend-confirmed session controls" }, 400: { description: "Invalid or unoffered selection" }, 409: { description: "Unavailable, busy or unconfirmed change" } } },
    },
    "/v1/sessions/{id}/compaction-policy": { get: { operationId: "getCompactionPolicy", responses: { 200: { description: "Native session automatic compaction policy" }, 409: { description: "Native policy capability unavailable" } } }, post: { operationId: "setCompactionPolicy", responses: { 200: { description: "Validated native policy updated" }, 409: { description: "Unsupported, busy or rejected native policy" } } } },
    "/v1/sessions/{id}/compact": { post: { operationId: "compactSession", responses: { 200: { description: "Native compacted, unchanged or requested outcome" }, 409: { description: "Unsupported, busy or native compaction failed" } } } },
    "/v1/sessions/{id}/rename": { post: { operationId: "renameSession", responses: { 200: { description: "Durable title updated" }, 409: { description: "Unsupported or busy" } } } },
    "/v1/sessions/{id}/fork": { post: { operationId: "forkSession", responses: { 201: { description: "Durable fork reference" }, 409: { description: "Unsupported or busy" } } } },
    "/v1/catalog/{backendId}/{sessionId}/rename": { post: { operationId: "renameCatalogSession", responses: { 200: { description: "Native title updated without opening an offline session" }, 409: { description: "Occupied, busy or unsupported" } } } },
    "/v1/catalog/{backendId}/{sessionId}/archive": { post: { operationId: "archiveSession", responses: { 200: { description: "Archived by the backend" }, 409: { description: "Active or unsupported" } } } },
    "/v1/sessions/{id}/models": { get: { operationId: "listSessionModels", responses: { 200: { description: "Selectable models and active route" } } } },
    "/v1/sessions/{id}/context": { get: { operationId: "sessionContext", responses: { 200: { description: "Workspace and model image-input capabilities" } } } },
    "/v1/sessions/{id}/context/files": { get: { operationId: "workspaceFiles", responses: { 200: { description: "Bounded workspace file suggestions" } } } },
    "/v1/sessions/{id}/context/preview": { post: { operationId: "previewContext", responses: { 200: { description: "CLI file-reference expansion preview" } } } },
    "/v1/sessions/{id}/model": { post: { operationId: "switchSessionModel", responses: { 200: { description: "Session using the selected model" }, 409: { description: "Busy or unavailable model" } } } },
    "/v1/sessions/{id}/events": { get: { operationId: "streamSessionEvents", responses: { 200: { description: "SSE agent-event stream" } } } },
    "/v1/sessions/{id}/flagquantum-evidence": { get: { operationId: "flagQuantumEvidence", responses: { 200: { description: "FlagQuantum tool calls, bounded two-qubit VQE numerical checks, and digest-bound MCP validator responses derived from complete Harness session events; not a full scientific verdict" } } } },
    "/v1/sessions/{id}/science-telemetry": { get: { operationId: "scienceTelemetry", responses: { 200: { description: "Redacted tool and turn telemetry from backend history, plus local permission decisions when a complete journal exists" } } } },
    "/v1/sessions/{id}/messages": { post: { operationId: "submitMessage", responses: { 202: { description: "Message receipt" } } } },
    "/v1/sessions/{id}/subagents": { get: { operationId: "listSessionSubagents", responses: { 200: { description: "Native direct-child roster and observed lifecycle status" } } } },
    "/v1/sessions/{id}/subagents/{childId}/history": { get: { operationId: "subagentHistory", responses: { 200: { description: "Bounded child-only transcript page" }, 400: { description: "Invalid cursor" }, 404: { description: "Child not owned by this session" }, 409: { description: "Unsupported transcript source" } } } },
    "/v1/sessions/{id}/jobs": { get: { operationId: "listSessionJobs", responses: { 200: { description: "Session-owned native jobs with bounded non-consuming output tails" } } } },
    "/v1/sessions/{id}/jobs/{jobId}/stop": { post: { operationId: "stopSessionJob", responses: { 200: { description: "Native job stop requested" }, 404: { description: "Job not owned by this session" }, 409: { description: "Unsupported backend" } } } },
    "/v1/sessions/{id}/cancel": { post: { operationId: "cancelSession", responses: { 200: { description: "Cancellation receipt" } } } },
    "/v1/sessions/{id}/permissions/{requestId}": { post: { operationId: "answerPermission", responses: { 200: { description: "Permission response receipt" } } } },
    "/v1/sessions/{id}/questions/{requestId}": { post: { operationId: "answerQuestion", responses: { 200: { description: "Question response receipt" } } } },
    "/v1/sessions/{id}/questions/{requestId}/cancel": { post: { operationId: "cancelQuestion", responses: { 200: { description: "Question cancellation receipt" } } } },
  },
});
