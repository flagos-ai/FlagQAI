export const FLAGQAI_SDK_PROTOCOL_VERSION = "2026-10-14.1";

const API_PREFIX = "/v1";

export class FlagQaiApiError extends Error {
  constructor(status, code, message, options) {
    super(message, options);
    this.name = "FlagQaiApiError";
    this.status = status;
    this.code = code;
  }
}

const resolveBaseUrl = (value) => {
  const fallback = typeof globalThis.location?.origin === "string"
    ? globalThis.location.origin
    : "http://127.0.0.1:4096";
  const url = new URL(value ?? fallback, fallback);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError("FlagQAI baseUrl must use HTTP or HTTPS");
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError("FlagQAI baseUrl must not contain credentials");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
};

const parseError = async (response) => {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new FlagQaiApiError(response.status, "invalid_response", `FlagQAI returned HTTP ${response.status}`);
  }
  const code = typeof body?.error?.code === "string" ? body.error.code : "request_failed";
  const message = typeof body?.error?.message === "string"
    ? body.error.message
    : `FlagQAI returned HTTP ${response.status}`;
  throw new FlagQaiApiError(response.status, code, message);
};

const parseJson = async (response, expectedStatus) => {
  if (response.status !== expectedStatus) await parseError(response);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new FlagQaiApiError(response.status, "invalid_response", "FlagQAI returned a non-JSON response");
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new FlagQaiApiError(response.status, "invalid_response", "FlagQAI returned invalid JSON", { cause });
  }
};

const parseEventFrame = (lines) => {
  let id;
  let event = "message";
  const data = [];
  for (const line of lines) {
    if (line === "" || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "id" && !value.includes("\0")) id = value;
    else if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return undefined;
  if (event !== "agent-event") return undefined;
  try {
    const record = JSON.parse(data.join("\n"));
    const wireId = id === undefined ? record?.id : Number(id);
    if (
      typeof record !== "object" || record === null || Array.isArray(record)
      || !Number.isSafeInteger(wireId) || wireId < 1
      || (id !== undefined && record.id !== wireId)
      || typeof record.session !== "string"
      || typeof record.event?.type !== "string"
      || typeof record.meta !== "object" || record.meta === null || Array.isArray(record.meta)
    ) throw new Error("invalid agent-event record");
    return { ...record, id: wireId };
  } catch (cause) {
    throw new FlagQaiApiError(200, "invalid_event", "FlagQAI returned an invalid SSE event", { cause });
  }
};

async function* decodeEventStream(response, signal, onOpen, idleTimeoutMs) {
  if (!response.ok) await parseError(response);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("text/event-stream")) {
    throw new FlagQaiApiError(response.status, "invalid_response", "FlagQAI returned a non-SSE event stream");
  }
  if (response.body === null) {
    throw new FlagQaiApiError(response.status, "invalid_response", "FlagQAI returned an empty event stream");
  }
  onOpen?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lines = [];
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      let timeout;
      let abort;
      const interrupted = new Promise((_, reject) => {
        abort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        if (idleTimeoutMs > 0) timeout = setTimeout(() => reject(new FlagQaiApiError(0, "event_stream_timeout", "The event stream stopped responding; reconnect to restore session state")), idleTimeoutMs);
      });
      let chunk;
      try { chunk = await Promise.race([reader.read(), interrupted]); }
      finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
      const { done, value } = chunk;
      buffer += decoder.decode(value, { stream: !done });
      while (true) {
        const lf = buffer.indexOf("\n");
        const cr = buffer.indexOf("\r");
        const newline = lf === -1 ? cr : cr === -1 ? lf : Math.min(lf, cr);
        if (newline === -1) break;
        if (!done && buffer[newline] === "\r" && newline === buffer.length - 1) break;
        const line = buffer.slice(0, newline);
        const width = buffer[newline] === "\r" && buffer[newline + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(newline + width);
        if (line === "") {
          const record = parseEventFrame(lines);
          lines = [];
          if (record !== undefined) yield record;
        } else {
          lines.push(line);
        }
      }
      if (done) break;
    }
    if (buffer !== "") lines.push(buffer);
    const final = parseEventFrame(lines);
    if (final !== undefined) yield final;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createFlagQaiClient(options = {}) {
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("FlagQAI SDK requires fetch");
  const request = (path, init) => {
    const pathname = `${baseUrl.pathname}/${path.replace(/^\//, "")}`.replace(/^\/\//, "/");
    return fetchImpl(new URL(pathname, baseUrl), init);
  };
  const jsonRequest = (path, status, init) => request(path, init).then(response => parseJson(response, status));
  const jsonBody = (body, signal) => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  return Object.freeze({
    baseUrl: baseUrl.href.replace(/\/$/, ""),
    async health(options = {}) {
      return jsonRequest(`${API_PREFIX}/health`, 200, { signal: options.signal });
    },
    async listBackends(options = {}) {
      return (await jsonRequest(`${API_PREFIX}/backends`, 200, { signal: options.signal })).backends;
    },
    async listProviders(options = {}) {
      return jsonRequest(`${API_PREFIX}/providers`, 200, { signal: options.signal });
    },
    async discoverProviderModels(input, options = {}) {
      return (await jsonRequest(`${API_PREFIX}/providers/discover`, 200, jsonBody(input, options.signal))).models;
    },
    async configureProvider(input, options = {}) {
      return (await jsonRequest(`${API_PREFIX}/providers`, 201, jsonBody(input, options.signal))).provider;
    },
    async listSessionModels(id, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/models`, 200, { signal: options.signal });
    },
    async switchSessionModel(id, input, options = {}) {
      return (await jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/model`, 200, jsonBody(input, options.signal))).session;
    },
    async listSessions(options = {}) {
      return (await jsonRequest(`${API_PREFIX}/sessions`, 200, { signal: options.signal })).sessions;
    },
    async openSession(input, options = {}) {
      return (await jsonRequest(`${API_PREFIX}/sessions`, 201, jsonBody(input, options.signal))).session;
    },
    async getSession(id, options = {}) {
      return (await jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}`, 200, { signal: options.signal })).session;
    },
    async flagQuantumEvidence(id, options = {}) {
      return (await jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/flagquantum-evidence`, 200, { signal: options.signal })).evidence;
    },
    async scienceTelemetry(id, options = {}) {
      return (await jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/science-telemetry`, 200, { signal: options.signal })).telemetry;
    },
    async disposeSession(id, options = {}) {
      const response = await request(`${API_PREFIX}/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        signal: options.signal,
      });
      if (response.status !== 204) await parseError(response);
    },
    async getSessionControls(id, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/controls`, 200, { signal: options.signal });
    },
    async setSessionControl(id, input, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/controls`, 200, jsonBody(input, options.signal));
    },
    async setSessionPlan(id, input, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/plan`, 200, jsonBody(input, options.signal));
    },
    async getCompactionPolicy(id, options = {}) { return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/compaction-policy`, 200, {signal:options.signal}); },
    async setCompactionPolicy(id, input, options = {}) { return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/compaction-policy`, 200, jsonBody(input, options.signal)); },
    async compactSession(id, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/compact`, 200, jsonBody({}, options.signal));
    },
    async renameSession(id, title, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/rename`, 200, jsonBody({ title }, options.signal));
    },
    async forkSession(id, input = {}, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/fork`, 201, jsonBody(input, options.signal));
    },
    async renameCatalogSession(backendId, sessionId, title, options = {}) {
      return jsonRequest(`${API_PREFIX}/catalog/${encodeURIComponent(backendId)}/${encodeURIComponent(sessionId)}/rename`, 200, jsonBody({ title }, options.signal));
    },
    async archiveSession(backendId, sessionId, options = {}) {
      return jsonRequest(`${API_PREFIX}/catalog/${encodeURIComponent(backendId)}/${encodeURIComponent(sessionId)}/archive`, 200, jsonBody({}, options.signal));
    },
    async sessionContext(id, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/context`, 200, { signal: options.signal });
    },
    async workspaceFiles(id, query = "", options = {}) {
      return (await jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/context/files?q=${encodeURIComponent(query)}`, 200, { signal: options.signal })).files;
    },
    async previewContext(id, text, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/context/preview`, 200, jsonBody({ text }, options.signal));
    },
    async submitMessage(id, input, options = {}) {
      return (await jsonRequest(
        `${API_PREFIX}/sessions/${encodeURIComponent(id)}/messages`,
        202,
        jsonBody(input, options.signal),
      )).receipt;
    },
    async listSessionSubagents(id, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/subagents`, 200, { signal: options.signal });
    },
    async subagentHistory(id, childId, before, options = {}) {
      const query = before === undefined ? '' : `?before=${encodeURIComponent(before)}`;
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/subagents/${encodeURIComponent(childId)}/history${query}`, 200, { signal: options.signal });
    },
    async listSessionJobs(id, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/jobs`, 200, { signal: options.signal });
    },
    async stopSessionJob(id, jobId, options = {}) {
      return jsonRequest(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobId)}/stop`, 200, jsonBody({}, options.signal));
    },
    async cancelSession(id, input = {}, options = {}) {
      return (await jsonRequest(
        `${API_PREFIX}/sessions/${encodeURIComponent(id)}/cancel`,
        200,
        jsonBody(input, options.signal),
      )).receipt;
    },
    async answerPermission(id, requestId, decision, options = {}) {
      return (await jsonRequest(
        `${API_PREFIX}/sessions/${encodeURIComponent(id)}/permissions/${encodeURIComponent(requestId)}`,
        200,
        jsonBody(decision, options.signal),
      )).receipt;
    },
    async answerQuestion(id, requestId, answers, options = {}) {
      return (await jsonRequest(
        `${API_PREFIX}/sessions/${encodeURIComponent(id)}/questions/${encodeURIComponent(requestId)}`,
        200,
        jsonBody(answers, options.signal),
      )).receipt;
    },
    async cancelQuestion(id, requestId, options = {}) {
      return (await jsonRequest(
        `${API_PREFIX}/sessions/${encodeURIComponent(id)}/questions/${encodeURIComponent(requestId)}/cancel`,
        200,
        jsonBody({}, options.signal),
      )).receipt;
    },
    events(id, options = {}) {
      const idleTimeoutMs = options.idleTimeoutMs ?? 45_000;
      if (!Number.isInteger(idleTimeoutMs) || idleTimeoutMs < 0 || idleTimeoutMs > 2_147_483_647) throw new TypeError("idleTimeoutMs must be an integer from 0 through 2147483647");
      const headers = {};
      if (options.lastEventId !== undefined) headers["last-event-id"] = String(options.lastEventId);
      return {
        async *[Symbol.asyncIterator]() {
          const response = await request(`${API_PREFIX}/sessions/${encodeURIComponent(id)}/events`, {
            headers,
            signal: options.signal,
          });
          yield* decodeEventStream(response, options.signal, options.onOpen, idleTimeoutMs);
        },
      };
    },
  });
}
