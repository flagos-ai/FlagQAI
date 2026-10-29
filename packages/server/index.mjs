import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer as createNodeServer } from "node:http";
import path from "node:path";
import { flagQuantumCallEvidence } from "../scientific-core/flagquantum-call-evidence.mjs";
import { sessionTelemetry } from "../scientific-core/session-telemetry.mjs";

import {
  FLAGQAI_API_PREFIX,
  FLAGQAI_OPENAPI,
  FLAGQAI_PROTOCOL_VERSION,
  ProtocolInputError,
  errorResource,
  parseCancelRequest,
  parseCreateSessionRequest,
  parseMessageRequest,
  parseModelSelection,
  parseSessionAction,
  parsePermissionResponse,
  parseProviderConfigurationRequest,
  parseProviderDiscoveryRequest,
  parseQuestionResponse,
  sessionCatalogResource,
  sessionResource,
} from "../protocol/index.mjs";

function sessionControls(session) {
  const effort = session.capabilities?.effort;
  const modes = session.capabilities?.modes;
  const plan = session.capabilities?.plan;
  const planState = plan?.current();
  return {
    plan: { available: Boolean(plan), active: planState?.active === true, pending: planState?.pending ?? null },
    effort: { available: Boolean(effort), current: effort?.current() ?? null, options: effort?.levels() ?? [], fallback: effort?.levelsFallback === true },
    mode: { available: Boolean(modes), current: modes?.current() ?? null, options: modes?.list() ?? [] },
  };
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4096;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_BUFFERED_EVENTS = 2_000;

const WEB_ASSETS = Object.freeze(new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/assets/app.css", ["assets/app.css", "text/css; charset=utf-8"]],
  ["/assets/markdown.mjs", ["assets/markdown.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/vendor/marked.mjs", ["assets/vendor/marked.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/task-progress.mjs", ["assets/task-progress.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/subagents.mjs", ["assets/subagents.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/jobs.mjs", ["assets/jobs.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/session-controls.mjs", ["assets/session-controls.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/app.mjs", ["assets/app.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/session-client.mjs", ["assets/session-client.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/context-monitor.mjs", ["assets/context-monitor.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/context-composer.mjs", ["assets/context-composer.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/sdk.mjs", ["assets/sdk.mjs", "text/javascript; charset=utf-8"]],
]));

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

const resumeConflictMessage = (error, backendLabel) => {
  const detail = error instanceof Error ? error.message : "";
  const backend = typeof backendLabel === "string" && backendLabel.trim() !== ""
    ? backendLabel.trim()
    : "Agent";
  if (/active writer|already (?:open|active)|\bin use\b|being used|正被另一个|正在(?:另一个|其他).*使用/iu.test(detail)) {
    return `This ${backend} session is open in another client. Close it there, then try again.`;
  }
  if (/not found|does not exist|no such|找不到|不存在/iu.test(detail)) {
    return `This ${backend} session could not be found. It may have been deleted or moved.`;
  }
  if (/permission denied|access denied|not permitted|无权限|权限不足/iu.test(detail)) {
    return `FlagQAI does not have permission to open this ${backend} session.`;
  }
  return "Could not resume this session. It may already be open in another client or no longer be available.";
};

const isLoopbackHost = (host) =>
  host === "127.0.0.1" || host === "::1" || host === "localhost";

const json = (response, status, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(payload);
};

const empty = (response, status) => {
  response.writeHead(status, { "cache-control": "no-store" });
  response.end();
};

async function serveWebAsset(response, method, pathname, webRoot) {
  const asset = WEB_ASSETS.get(pathname);
  if (asset === undefined || webRoot === undefined) return false;
  const [relativePath, contentType] = asset;
  let body;
  try {
    body = await readFile(path.join(webRoot, relativePath));
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  response.writeHead(200, {
    // Stable asset filenames must revalidate when a source-owned client updates.
    "cache-control": "no-cache",
    "content-length": body.byteLength,
    "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "content-type": contentType,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(method === "HEAD" ? undefined : body);
  return true;
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw new HttpError(413, "body_too_large", "request body exceeds its size limit");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return undefined;
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "request body must use application/json");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "request body is not valid JSON");
  }
}

const routeSegments = (pathname) => pathname.split("/").filter(Boolean).map((part) => {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new HttpError(400, "invalid_path", "request path contains invalid encoding");
  }
});

const sseFrame = (record) =>
  `id: ${record.id}\nevent: agent-event\ndata: ${JSON.stringify(record)}\n\n`;

function eventRecord(resourceId, id, event, meta) {
  const wireEvent = JSON.parse(JSON.stringify(event));
  const wireMeta = JSON.parse(JSON.stringify(meta ?? { wake: "immediate" }));
  return {
    id,
    session: resourceId,
    event: wireEvent,
    meta: wireMeta,
  };
}

function createSessionBinding(resourceId, session, onError, release, createView) {
  const view = createView?.(session);
  const events = [];
  const clients = new Set();
  const pendingPermissions = new Map();
  const pendingQuestions = new Map();
  const liveDuringSeed = [];
  let nextEventId = 1;
  let disposed = false;
  let seeding = true;
  let queued = [];
  let control;
  let activeTurn;
  let cancelTarget;
  let cancelEnded = false;
  let cancelling = false;

  const publish = (event, meta) => {
    if (disposed) return;
    if (event.type === 'pending.changed') queued = event.items;
    if (event.type === 'turn.start') activeTurn = event.turn;
    const ended = (event.type === 'turn.end' && (cancelTarget === undefined || event.turn === cancelTarget))
      || (event.type === 'session.status' && ['idle', 'disposed'].includes(event.status));
    if (control && control.state !== 'none' && ended) {
      cancelEnded = true;
      control = { ...control, state: 'stopped' };
    }
    if (event.type === "permission.request") pendingPermissions.set(event.request.requestId, event.request);
    else if (event.type === "permission.settled") pendingPermissions.delete(event.requestId);
    else if (event.type === "question.request") pendingQuestions.set(event.request.requestId, event.request);
    else if (event.type === "question.settled") pendingQuestions.delete(event.requestId);
    const record = eventRecord(resourceId, nextEventId++, event, meta);
    events.push(record);
    if (events.length > MAX_BUFFERED_EVENTS) events.shift();
    const frame = sseFrame(record);
    for (const client of clients) client.write(frame);
    if (ended && control?.state === 'stopped' && event.type !== 'session.control') publish(control, { wake: 'sync' });
    if (event.type === 'turn.start' && control && ['stopped', 'failed'].includes(control.state)) {
      control = { ...control, state: 'none' };
      publish(control, { wake: 'sync' });
    }
  };

  const exposesControls = () => view !== undefined || session.capabilities?.effort !== undefined || session.capabilities?.modes !== undefined || session.capabilities?.plan !== undefined;
  let priorControls;
  const publishControls = (meta = { wake: 'sync' }, force = false) => {
    if (!exposesControls()) return;
    const controls = sessionControls(session);
    const signature = JSON.stringify(controls);
    if (force || signature !== priorControls) { priorControls = signature; publish({ type: 'session.controls', controls }, meta); }
  };

  const unsubscribe = session.subscribe((batch, meta) => {
    if (seeding) {
      for (const event of batch) liveDuringSeed.push({ event, meta });
      return;
    }
    for (const event of batch) {
      try {
        publish(event, meta);
      } catch (error) {
        onError?.(error);
      }
    }
    try {
      publishControls(meta);
      if (view !== undefined) publish(view.apply(batch, meta), meta);
    } catch (error) {
      onError?.(error);
    }
  });

  const seed = async () => {
    try {
      const history = await session.history();
      for (const event of history) publish(event, { wake: "immediate", replay: true });
      if (view !== undefined) publish(view.apply(history, { wake: "immediate", replay: true }), { wake: "immediate", replay: true });
    } finally {
      seeding = false;
    }
    for (const { event, meta } of liveDuringSeed.splice(0)) {
      publish(event, meta);
      if (view !== undefined) publish(view.apply([event], meta), meta);
    }
  };

  return {
    controls: () => sessionControls(session),
    publishControls,
    publishView() { if (view !== undefined) publish(view.snapshot(), {wake:'sync'}); },
    changingModel: false,
    preparingInput: false,
    acting: false,
    compacting: false,
    submissions: new Map(),
    resourceId,
    session,
    events,
    clients,
    pendingPermissions,
    pendingQuestions,
    seed,
    async cancel(cause) {
      if (cancelling) throw new HttpError(409, 'cancel_in_progress', 'Wait for the current stop request');
      cancelling = true;
      cancelTarget = activeTurn;
      cancelEnded = false;
      control = { type: 'session.control', state: 'stopping', requestId: randomUUID(), cause };
      publish(control, { wake: 'sync' });
      try {
        const receipt = await session.cancel(cause);
        control = { ...control, ...receipt, state: cancelEnded || session.status === 'idle' ? 'stopped'
          : receipt.outcome === 'confirmed' ? 'stopping' : receipt.outcome === 'failed' ? 'failed' : 'unknown' };
        publish(control, { wake: 'sync' });
        return receipt;
      } catch (error) {
        control = { ...control, state: cancelEnded ? 'stopped' : 'failed', outcome: 'failed' };
        publish(control, { wake: 'sync' });
        throw error;
      } finally { cancelling = false; }
    },
    // A connection needs a complete baseline even when the bounded event log
    // no longer contains its first projection. Allocate a stream ID without
    // repainting other clients or adding derived snapshots to durable history.
    snapshotRecords() {
      const meta = { wake: 'sync', replay: true };
      return [
        ...(exposesControls() ? [eventRecord(resourceId, nextEventId++, { type: 'session.controls', controls: sessionControls(session) }, meta)] : []),
        ...(view?.snapshot === undefined ? [] : [eventRecord(resourceId, nextEventId++, { ...view.snapshot(), pending: { permissions: [...pendingPermissions.keys()], questions: [...pendingQuestions.keys()] } }, meta)]),
        eventRecord(resourceId, nextEventId++, { type: 'pending.changed', items: queued }, meta),
        ...(control === undefined ? [] : [eventRecord(resourceId, nextEventId++, control, meta)]),
        ...[...pendingPermissions.values()].map(request => eventRecord(resourceId, nextEventId++, { type: 'permission.request', request }, meta)),
        ...[...pendingQuestions.values()].map(request => eventRecord(resourceId, nextEventId++, { type: 'question.request', request }, meta)),
      ];
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      for (const client of clients) client.end();
      clients.clear();
      try {
        await session.dispose();
      } finally {
        release?.();
      }
    },
  };
}

export function createEmptyBackendRegistry() {
  return Object.freeze({
    ids: Object.freeze([]),
    async load(id) {
      throw new Error(`Unknown agent backend "${id}"`);
    },
    async detect(id) {
      throw new Error(`Unknown agent backend "${id}"`);
    },
  });
}

export function createFlagQaiServer(options = {}) {
  const eventHeartbeatMs = options.eventHeartbeatMs ?? 15_000;
  if (!Number.isInteger(eventHeartbeatMs) || eventHeartbeatMs < 1 || eventHeartbeatMs > 2_147_483_647) throw new TypeError("eventHeartbeatMs must be a positive timer interval");
  const hostname = options.hostname ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  if (!isLoopbackHost(hostname) && options.allowRemote !== true) {
    throw new Error("FlagQAI server refuses a non-loopback bind without allowRemote: true");
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("port must be an integer from 0 through 65535");
  }
  const registry = options.registry ?? createEmptyBackendRegistry();
  const providerManager = options.providerManager;
  const sessionGuard = options.sessionGuard;
  const webRoot = options.webRoot === undefined ? undefined : path.resolve(options.webRoot);
  const backendHost = options.backendHost ?? {
    cwd: process.cwd(),
    debug: () => undefined,
    warn: (message) => console.warn(message),
  };
  const sessions = new Map();

  const findSession = (id) => {
    const binding = sessions.get(id);
    if (binding === undefined) throw new HttpError(404, "session_not_found", `session "${id}" was not found`);
    return binding;
  };

  const handler = async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? hostname}`);
      const method = request.method ?? "GET";
      if ((method === "GET" || method === "HEAD") && await serveWebAsset(response, method, url.pathname, webRoot)) {
        return;
      }
      if (method === "GET" && url.pathname === "/openapi.json") {
        json(response, 200, FLAGQAI_OPENAPI);
        return;
      }
      if (!url.pathname.startsWith(`${FLAGQAI_API_PREFIX}/`)) {
        throw new HttpError(404, "route_not_found", "route was not found");
      }
      const segments = routeSegments(url.pathname.slice(FLAGQAI_API_PREFIX.length));

      if (method === "GET" && segments.length === 1 && segments[0] === "health") {
        json(response, 200, {
          product: "FlagQAI",
          protocolVersion: FLAGQAI_PROTOCOL_VERSION,
          status: "ready",
          backendCount: registry.ids.length,
        });
        return;
      }

      if (method === "GET" && segments.length === 1 && segments[0] === "backends") {
        const backends = await Promise.all(registry.ids.map(async (id) => {
          try {
            const backend = await registry.load(id);
            return {
              id,
              label: backend.descriptor.label,
              detection: await backend.detect(backendHost),
            };
          } catch (error) {
            options.onError?.(error);
            return { id, detection: { installed: false, hint: "Backend detection failed" } };
          }
        }));
        json(response, 200, { backends });
        return;
      }

      if (method === "GET" && segments.length === 1 && segments[0] === "providers") {
        if (providerManager === undefined) {
          json(response, 200, { available: false, ready: false, catalog: [], configured: [] });
          return;
        }
        json(response, 200, { available: true, ...await providerManager.status() });
        return;
      }

      if (method === "GET" && segments.length === 1 && segments[0] === "sessions") {
        const rows = (await Promise.all(registry.ids.map(async (backendId) => {
          try {
            const backend = await registry.load(backendId);
            if (backend.catalog === undefined) return [];
            const scope = { allProjects: true };
            const [summaries, backendOccupied] = await Promise.all([
              backend.catalog.list(scope),
              backend.catalog.occupiedIds?.(scope) ?? Promise.resolve(new Set()),
            ]);
            return summaries
              .filter(summary => summary.hasPrompt !== false && summary.kind?.kind !== "subagent")
              .map((summary) => {
                const active = [...sessions.values()].find(binding =>
                  binding.session.ref.backendId === backendId && binding.session.ref.sessionId === summary.id);
                const guarded = sessionGuard?.occupancy(backendId, summary.id) ?? { kind: "free" };
                const occupancy = guarded.kind === "free" && backendOccupied.has(summary.id)
                  ? { kind: "occupied" }
                  : guarded;
                return { actions: { rename: typeof backend.catalog.rename === "function" || !!active?.session.capabilities?.rename, archive: backend.catalog.deleteAction === "archive" && typeof backend.catalog.delete === "function" }, ...sessionCatalogResource(
                  { ...summary, backendId },
                  {
                    ...(active === undefined ? {} : { resourceId: active.resourceId }),
                    occupancy: occupancy.kind,
                    ...(occupancy.kind === "occupied" ? { pid: occupancy.pid } : {}),
                  },
                ) };
              });
          } catch (error) {
            options.onError?.(error);
            return [];
          }
        }))).flat().sort((a, b) => b.updatedAt - a.updatedAt);
        json(response, 200, { sessions: rows });
        return;
      }

      if (method === "POST" && segments.length === 4 && segments[0] === "catalog" && segments[3] === "rename") {
        const [backendId, sessionId] = segments.slice(1, 3);
        if (!registry.ids.includes(backendId)) throw new HttpError(404, "backend_not_found", "Unknown backend");
        const input = parseSessionAction(await readJson(request));
        const backend = await registry.load(backendId);
        const summary = (await backend.catalog?.list({ allProjects: true }))?.find(item => item.id === sessionId);
        if (!summary) throw new HttpError(404, "session_not_found", "Session not found");
        const active = [...sessions.values()].find(item => item.session.ref.backendId === backendId && item.session.ref.sessionId === sessionId);
        if (active) {
          if (active.acting || active.compacting || active.changingModel || active.preparingInput || active.session.status !== "idle" || active.pendingPermissions.size || active.pendingQuestions.size) throw new HttpError(409, "session_busy", "Finish the current turn and pending decisions first");
          if (!active.session.capabilities?.rename) throw new HttpError(409, "rename_unsupported", "This backend does not support renaming an open session");
          active.acting = true;
          try { await active.session.capabilities.rename.rename(input.title); }
          catch { throw new HttpError(409, "rename_failed", "Could not rename this session"); }
          finally { active.acting = false; }
        } else {
          if (typeof backend.catalog?.rename !== "function") throw new HttpError(409, "rename_unsupported", "This backend does not support offline renaming");
          const reservation = sessionGuard === undefined ? undefined : await sessionGuard.reserve(backendId, sessionId);
          if (reservation?.ok === false) throw new HttpError(409, "session_occupied", "This session is open in another process");
          try {
            if ((await backend.catalog.occupiedIds?.({ allProjects: true }))?.has(sessionId)) throw new HttpError(409, "session_occupied", "This session is open in another process");
            await backend.catalog.rename(sessionId, input.title, summary.cwd);
          } catch (error) { if(error instanceof HttpError) throw error; throw new HttpError(409, "rename_failed", "Could not rename this session"); }
          finally { reservation?.abandon(); reservation?.release(); }
        }
        json(response, 200, { title: input.title }); return;
      }

      if (method === "POST" && segments.length === 4 && segments[0] === "catalog" && segments[3] === "archive") {
        const [backendId, sessionId] = segments.slice(1, 3);
        if (!registry.ids.includes(backendId)) throw new HttpError(404, "backend_not_found", "Unknown backend");
        const body = await readJson(request);
        if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length) throw new ProtocolInputError('archive takes an empty object');
        const backend = await registry.load(backendId);
        if (backend.catalog?.deleteAction !== 'archive' || typeof backend.catalog.delete !== 'function') throw new HttpError(409, "archive_unsupported", "This backend does not support preserving archived sessions");
        if ([...sessions.values()].some(item => item.session.ref.backendId === backendId && item.session.ref.sessionId === sessionId)) throw new HttpError(409, "session_active", "Close this session before archiving");
        const reservation = sessionGuard === undefined ? undefined : await sessionGuard.reserve(backendId, sessionId);
        if (reservation?.ok === false) throw new HttpError(409, "session_occupied", "This session is open in another process");
        try {
          if ((await backend.catalog.occupiedIds?.({ allProjects: true }))?.has(sessionId)) throw new HttpError(409, "session_occupied", "This session is open in another process");
          if (!(await backend.catalog.list({ allProjects: true })).some(item => item.id === sessionId)) throw new HttpError(404, "session_not_found", "Session not found");
          try { await backend.catalog.delete(sessionId); } catch { throw new HttpError(409, "archive_failed", "Could not archive this session"); }
          json(response, 200, { archived: true });
        } finally { reservation?.abandon(); reservation?.release(); }
        return;
      }

      if (method === "POST" && segments.length === 2 && segments[0] === "providers" && segments[1] === "discover") {
        if (providerManager === undefined) {
          throw new HttpError(503, "provider_setup_unavailable", "provider setup is unavailable in this server");
        }
        const input = parseProviderDiscoveryRequest(await readJson(request));
        try {
          json(response, 200, { models: await providerManager.discover(input) });
        } catch (error) {
          const status = typeof error?.status === "number" ? error.status : error?.statusCode;
          const message = status === 401 || status === 403 ? "Provider authentication failed. Check the API key and account permissions."
            : status === 404 ? "The model discovery endpoint was not found. Check the base URL and API protocol."
            : status === 429 ? "The provider rate limit was reached. Try again later."
            : status === 408 || status === 504 ? "The provider connection timed out. Check the endpoint and network."
            : "Could not discover models. Check the endpoint, protocol, and API key.";
          throw new HttpError(502, "provider_discovery_failed", message);
        }
        return;
      }

      if (method === "POST" && segments.length === 1 && segments[0] === "providers") {
        if (providerManager === undefined) {
          throw new HttpError(503, "provider_setup_unavailable", "provider setup is unavailable in this server");
        }
        const input = parseProviderConfigurationRequest(await readJson(request));
        try {
          json(response, 201, { provider: await providerManager.configure(input) });
        } catch {
          throw new HttpError(409, "provider_configuration_failed", "Could not save this provider configuration.");
        }
        return;
      }

      if (method === "POST" && segments.length === 1 && segments[0] === "sessions") {
        const parsed = parseCreateSessionRequest(await readJson(request));
        if (!registry.ids.includes(parsed.backendId)) {
          throw new HttpError(404, "backend_not_found", `backend "${parsed.backendId}" was not found`);
        }
        let backend;
        try {
          backend = await registry.load(parsed.backendId);
        } catch (error) {
          options.onError?.(error);
          throw new HttpError(503, "backend_unavailable", `backend "${parsed.backendId}" is unavailable`);
        }
        const active = parsed.target.kind === "resume"
          ? [...sessions.values()].find(binding =>
            binding.session.ref.backendId === parsed.backendId && binding.session.ref.sessionId === parsed.target.sessionId)
          : undefined;
        if (active !== undefined) {
          throw new HttpError(409, "session_already_active", `session is already active as resource "${active.resourceId}"`);
        }
        const reservation = parsed.target.kind === "resume" && sessionGuard !== undefined
          ? await sessionGuard.reserve(parsed.backendId, parsed.target.sessionId)
          : undefined;
        if (reservation !== undefined && !reservation.ok) {
          throw new HttpError(409, "session_occupied", reservation.pid === undefined
            ? "session is already in use"
            : `session is already in use by process ${reservation.pid}`);
        }
        let session;
        try {
          session = await backend.open(parsed.target, { ...backendHost, cwd: parsed.target.cwd });
        } catch (error) {
          reservation?.abandon();
          options.onError?.(error);
          if (parsed.target.kind === "resume") {
            throw new HttpError(
              409,
              "session_resume_failed",
              resumeConflictMessage(error, backend.descriptor.label),
            );
          }
          throw error;
        }
        if (options.permissionDecisionStore) {
          try { await options.permissionDecisionStore.initialize(session.ref, { fresh: parsed.target.kind === 'create' }); }
          catch (error) {
            options.onError?.(error);
            await session.dispose().catch(disposeError => options.onError?.(disposeError));
            reservation?.abandon();
            throw new HttpError(503, 'permission_evidence_unavailable', 'Could not initialize the local permission evidence');
          }
        }
        const resourceId = randomUUID();
        const binding = createSessionBinding(resourceId, session, options.onError, reservation?.release, options.createSessionView);
        sessions.set(resourceId, binding);
        try {
          await binding.seed();
          reservation?.settle();
        } catch (error) {
          sessions.delete(resourceId);
          await binding.dispose();
          reservation?.abandon();
          throw error;
        }
        json(response, 201, { session: sessionResource(resourceId, session) });
        return;
      }

      if (segments.length >= 2 && segments[0] === "sessions") {
        const binding = findSession(segments[1]);
        // Native compaction accepts messages into its own inbox; only actions that
        // change the session binding are excluded while its transaction settles.
        if (binding.compacting && method !== "GET" && !['messages', 'cancel'].includes(segments[2])) throw new HttpError(409, "compaction_in_progress", "Wait for native compaction to finish");
        if (method !== "GET" && binding.acting) throw new HttpError(409, "session_action_in_progress", "Wait for the session action to finish");
        if (method !== "GET" && binding.changingModel) throw new HttpError(409, "model_switch_in_progress", "Wait for the model switch to finish");
        if (method !== "GET" && binding.preparingInput) throw new HttpError(409, "input_preparation_in_progress", "Wait for the message attachments to finish");
        if (method === 'POST' && segments.length === 3 && segments[2] === 'plan') {
          const input = await readJson(request);
          if (typeof input?.active !== 'boolean' || Object.keys(input).some(key => key !== 'active')) throw new HttpError(400, 'invalid_plan', 'Choose whether plan mode is active');
          if (binding.acting || binding.compacting || binding.changingModel || binding.preparingInput || binding.session.status !== 'idle' || binding.pendingPermissions.size || binding.pendingQuestions.size) throw new HttpError(409, 'session_busy', 'Finish the current turn and pending decisions first');
          const capability = binding.session.capabilities?.plan;
          if (!capability) throw new HttpError(409, 'plan_unsupported', 'This backend does not offer plan mode');
          binding.acting = true;
          try {
            await capability.set(input.active);
            const state = capability.current();
            if ((state.pending ?? state.active) !== input.active) throw new Error('Plan change was not confirmed');
            json(response, 200, binding.controls());
          } catch { throw new HttpError(409, 'plan_failed', 'The backend did not confirm the change. Refresh the controls before retrying.'); }
          finally { binding.acting = false; binding.publishControls(); }
          return;
        }
        if (segments.length === 3 && segments[2] === 'controls') {
          if (method === 'GET') { json(response, 200, binding.controls()); return; }
          if (method === 'POST') {
            const input = await readJson(request);
            if (!input || !['effort', 'mode'].includes(input.kind) || !(typeof input.id === 'string' && input.id.length || input.kind === 'effort' && input.id === null)) throw new HttpError(400, 'invalid_control', 'Choose an effort or mode ID');
            if (binding.acting || binding.compacting || binding.changingModel || binding.preparingInput) throw new HttpError(409, 'session_busy', 'Wait for the current session action');
            const capability = binding.session.capabilities?.[input.kind === 'mode' ? 'modes' : 'effort'];
            if (!capability) throw new HttpError(409, 'control_unsupported', 'This backend does not support this control');
            const options = input.kind === 'mode' ? capability.list() : capability.levels();
            if (input.id !== null && !options.some(option => option.id === input.id)) throw new HttpError(400, 'invalid_control', 'This backend does not offer the selected value');
            if (binding.session.status !== 'idle' || binding.pendingPermissions.size || binding.pendingQuestions.size) throw new HttpError(409, 'session_busy', 'Finish the current turn and pending decisions first');
            binding.acting = true;
            try {
              await capability.set(input.id);
              if ((capability.current() ?? null) !== input.id) throw new Error('Backend did not confirm the selected value');
              json(response, 200, binding.controls());
            } catch { throw new HttpError(409, 'control_failed', 'The backend did not confirm the change. Refresh the controls before retrying.'); }
            finally { binding.acting = false; binding.publishControls(); }
            return;
          }
        }
        if (segments.length === 3 && segments[2] === 'compaction-policy' && ['GET', 'POST'].includes(method)) {
          const policy = binding.session.capabilities?.compact?.policy;
          if (!policy) throw new HttpError(409, 'compaction_policy_unsupported', 'This backend does not expose live compaction settings.');
          if (method === 'GET') { json(response, 200, {policy: policy.read()}); return; }
          if (binding.session.status !== 'idle' || binding.compacting || binding.pendingPermissions.size || binding.pendingQuestions.size) throw new HttpError(409, 'session_busy', 'Finish the current turn and pending decisions first');
          const input = await readJson(request);
          if (!input || typeof input.enabled !== 'boolean' || !Number.isFinite(input.thresholdRatio) || input.thresholdRatio < .5 || input.thresholdRatio > .95 || Object.keys(input).some(key => !['enabled','thresholdRatio'].includes(key))) throw new HttpError(400, 'invalid_compaction_policy', 'Choose an enabled flag and threshold between 50% and 95%.');
          binding.acting = true;
          try { const updated = await policy.update(input); binding.publishView(); json(response, 200, {policy:updated}); }
          catch { throw new HttpError(409, 'compaction_policy_failed', 'Native compaction settings were not saved.'); }
          finally { binding.acting = false; }
          return;
        }
        if (method === "POST" && segments.length === 3 && segments[2] === 'compact') {
          const capability = binding.session.capabilities?.compact;
          if (!capability) throw new HttpError(409, "compact_unsupported", "This backend does not support native compaction");
          if (binding.session.status !== 'idle' || binding.pendingPermissions.size || binding.pendingQuestions.size) throw new HttpError(409, "session_busy", "Finish the current turn and pending decisions first");
          binding.compacting = true;
          try {
            await readJson(request);
            const outcome = await capability.run();
            json(response, 200, { outcome: outcome?.compacted === true ? 'compacted' : outcome?.compacted === false ? 'unchanged' : 'requested' });
          } catch (error) {
            if (error instanceof HttpError) throw error;
            throw new HttpError(409, "compact_failed", "Native compaction did not complete. Check the session before retrying.");
          } finally { binding.compacting = false; }
          return;
        }
        if (method === "POST" && segments.length === 3 && ['rename', 'fork'].includes(segments[2])) {
          const action = segments[2];
          const capability = binding.session.capabilities?.[action];
          if (!capability) throw new HttpError(409, "action_unsupported", `This backend does not support ${action}`);
          binding.acting = true;
          try {
            const input = parseSessionAction(await readJson(request), { fork: action === 'fork' });
            if (binding.session.status !== 'idle' || binding.pendingPermissions.size || binding.pendingQuestions.size) throw new HttpError(409, "session_busy", "Finish the current turn and pending decisions first");
            try {
              if (action === 'rename') { await capability.rename(input.title); json(response, 200, { title: input.title }); }
              else {
                if (input.anchor !== undefined && !(await binding.session.history()).some(event => event.type === 'user.message' && event.anchor === input.anchor)) throw new HttpError(400, "anchor_not_found", "The selected user message is not in this session");
                const ref = await capability.fork(input.anchor, input.title);
                if (ref?.backendId !== binding.session.ref.backendId || typeof ref.sessionId !== 'string' || !ref.sessionId || ref.sessionId === binding.session.ref.sessionId) throw new Error('Invalid fork reference');
                json(response, 201, { ref, cwd: binding.session.cwd });
              }
            } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(409, "session_action_failed", `Could not ${action} this session`); }
          } finally { binding.acting = false; }
          return;
        }
        if (segments[2] === "subagents") {
          const capability = binding.session.capabilities?.subagents;
          if (method === "GET" && segments.length === 3) {
            json(response, 200, { supported: typeof capability?.list === 'function', history: typeof capability?.history === 'function', subagents: capability?.list ? await capability.list() : [] });
            return;
          }
          if (method === "GET" && segments.length === 5 && segments[4] === "history") {
            if (!capability?.list || !capability.history) throw new HttpError(409, "subagent_history_unsupported", "This backend does not expose child transcripts");
            const childId = segments[3];
            if (!childId || childId.length > 256) throw new HttpError(400, "invalid_child_id", "Invalid child ID");
            if (!(await capability.list()).some(child => child.id === childId)) throw new HttpError(404, "subagent_not_found", "Subagent is not a direct child of this session");
            const rawSkip = url.searchParams.get('before');
            const before = rawSkip === null ? undefined : Number(rawSkip);
            if (before !== undefined && (!/^\d+$/.test(rawSkip) || !Number.isSafeInteger(before) || before < 0)) throw new HttpError(400, "invalid_child_window", "Invalid transcript cursor");
            const page = await capability.history(childId, before === undefined ? undefined : { count: 400, skipFromStart: before });
            // The child reader owns paging and lineage. Bound only wire text,
            // preserving tool-call identities and source-window cursors.
            let remaining = 262144;
            let truncated = false;
            const text = value => {
              if (typeof value !== 'string') return '';
              const out = value.slice(0, Math.min(16384, remaining));
              remaining -= out.length;
              if (out.length !== value.length) truncated = true;
              return out;
            };
            const events = page.events.slice(-400).reverse().map(event => {
              if (event.type === 'assistant.message') return { type: event.type, blocks: (event.blocks ?? []).slice(0, 20).map(block => ({ type: block.type, text: text(block.text) })) };
              if (event.type === 'tool.call') return { type: event.type, callId: event.callId, name: text(event.name), argsJson: text(event.argsJson) };
              if (event.type === 'tool.result') return { type: event.type, callId: event.callId, isError: event.isError, text: text(event.text) };
              return { type: event.type };
            }).reverse();
            if (page.events.length > 400 || page.events.some(event => (event.blocks?.length ?? 0) > 20)) truncated = true;
            json(response, 200, { events, parentAgentId: page.parentAgentId, hasOlder: page.hasOlder, skippedFromStart: page.skippedFromStart, truncated });
            return;
          }
        }
        if (segments[2] === "jobs") {
          const capability = binding.session.capabilities?.jobs;
          if (method === "GET" && segments.length === 3) {
            json(response, 200, { supported: Boolean(capability), jobs: capability ? await capability.list() : [] });
            return;
          }
          if (method === "POST" && segments.length === 5 && segments[4] === "stop") {
            if (!capability) throw new HttpError(409, "jobs_unsupported", "This backend does not expose native jobs");
            await readJson(request);
            const id = segments[3];
            if (!id || id.length > 256) throw new HttpError(400, "invalid_job_id", "Invalid job ID");
            if (!(await capability.list()).some(job => job.id === id)) throw new HttpError(404, "job_not_found", "Job not found in this session");
            await capability.stop(id);
            json(response, 200, { stopped: id });
            return;
          }
        }
        if (segments[2] === "context") {
          const manager = options.contextManager;
          if (method === "GET" && segments.length === 3) {
            json(response, 200, manager ? await manager.status(binding.session) : { files: false, images: "unsupported" });
            return;
          }
          if (!manager) throw new HttpError(409, "context_unavailable", "Workspace context is unavailable");
          try {
            if (method === "GET" && segments[3] === "files" && segments.length === 4) {
              const query = url.searchParams.get("q") ?? "";
              if (query.length > 1024) throw new Error("query too long");
              json(response, 200, { files: await manager.list(binding.session, query) });
              return;
            }
            if (method === "POST" && segments[3] === "preview" && segments.length === 4) {
              const input = await readJson(request);
              if (typeof input?.text !== "string" || input.text.length > 50000 || Object.keys(input).some(key => key !== "text")) throw new Error("invalid preview");
              json(response, 200, await manager.preview(binding.session, input.text));
              return;
            }
          } catch { throw new HttpError(400, "context_failed", "Cannot read these workspace references. Check the path and file size."); }
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "models") {
          if (options.modelManager === undefined) {
            json(response, 200, { available: false, models: [] });
          } else {
            try { json(response, 200, await options.modelManager.list(binding.session)); }
            catch { throw new HttpError(502, "model_catalog_failed", "Could not load models from this backend"); }
          }
          return;
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "model") {
          if (options.modelManager === undefined) throw new HttpError(409, "models_unavailable", "Model switching is unavailable in this server");
          binding.changingModel = true;
          let replacement;
          let candidate;
          try {
            const ref = parseModelSelection(await readJson(request));
            if (binding.session.status !== "idle" || binding.pendingPermissions.size || binding.pendingQuestions.size) {
              throw new HttpError(409, "session_busy", "Finish the current turn and pending decisions before switching models");
            }
            try { candidate = await options.modelManager.switch(binding.session, ref); }
            catch { throw new HttpError(409, "model_switch_failed", "Could not switch models. Check that the provider and model are available; the current session is unchanged."); }
            if (candidate === binding.session) {
              json(response, 200, { session: sessionResource(binding.resourceId, candidate) });
              return;
            }
            await options.permissionDecisionStore?.initialize(candidate.ref, { fresh: false });
            const id = randomUUID();
            replacement = createSessionBinding(id, candidate, options.onError, () => options.modelManager.release?.(candidate), options.createSessionView);
            await replacement.seed();
            await options.modelManager.commit?.(candidate);
            sessions.set(id, replacement);
            sessions.delete(binding.resourceId);
            await binding.dispose().catch(error => options.onError?.(error));
            json(response, 200, { session: sessionResource(id, candidate) });
          } catch (error) {
            if (replacement && !sessions.has(replacement.resourceId)) await replacement.dispose();
            else if (candidate && candidate !== binding.session) await options.modelManager.release?.(candidate);
            throw error;
          } finally { binding.changingModel = false; }
          return;
        }
        if (method === "GET" && segments.length === 2) {
          json(response, 200, { session: sessionResource(binding.resourceId, binding.session) });
          return;
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "flagquantum-evidence") {
          // Read the complete authoritative history, not the bounded SSE ring.
          // A zero-call result is meaningful only if this read succeeds.
          const history = await binding.session.history();
          json(response, 200, { evidence: flagQuantumCallEvidence(history) });
          return;
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "science-telemetry") {
          // Project from durable backend-owned history, never model-authored
          // answers or the bounded live SSE buffer.
          const history = await binding.session.history();
          const decisions = await options.permissionDecisionStore?.read(binding.session.ref);
          json(response, 200, { telemetry: sessionTelemetry(history, binding.resourceId, decisions) });
          return;
        }
        if (method === "DELETE" && segments.length === 2) {
          sessions.delete(binding.resourceId);
          await binding.dispose();
          empty(response, 204);
          return;
        }
        if (method === "GET" && segments.length === 3 && segments[2] === "events") {
          response.writeHead(200, {
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            "content-type": "text/event-stream; charset=utf-8",
            "x-accel-buffering": "no",
          });
          response.write(": FlagQAI event stream\n\n");
          const lastEventId = Number(request.headers["last-event-id"] ?? 0);
          for (const record of binding.events) {
            if (!Number.isFinite(lastEventId) || record.id > lastEventId) response.write(sseFrame(record));
          }
          for (const record of binding.snapshotRecords()) response.write(sseFrame(record));
          binding.clients.add(response);
          // Transport liveness only: comments consume no event ID or history.
          const heartbeat = setInterval(() => {
            if (!response.destroyed && !response.writableEnded) response.write(": heartbeat\n\n");
          }, eventHeartbeatMs);
          heartbeat.unref();
          const cleanup = () => { clearInterval(heartbeat); binding.clients.delete(response); };
          response.once("close", cleanup);
          request.once("close", cleanup);
          return;
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "messages") {
          binding.preparingInput = true;
          try {
            const parsed = parseMessageRequest(await readJson(request, 6 * 1024 * 1024));
            const key = parsed.input.clientMessageId;
            if (key.length > 512) throw new HttpError(400, 'invalid_message_id', 'Message IDs must not exceed 512 characters');
            const fingerprint = createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
            const previous = binding.submissions.get(key);
            if (previous !== undefined) {
              if (previous.fingerprint !== fingerprint) throw new HttpError(409, 'message_id_conflict', 'This message ID already belongs to different input');
              if (previous.receipt === undefined) throw new HttpError(409, 'message_outcome_unknown', 'The backend outcome is unknown. Check the transcript before sending new input.');
              json(response, 202, { receipt: previous.receipt });
              return;
            }
            if (binding.submissions.size >= 4096) throw new HttpError(409, 'message_retry_limit', 'Reconnect to a new server resource before sending more messages');
            if (binding.changingModel || !sessions.has(binding.resourceId)) throw new HttpError(409, "session_changed", "Reconnect before sending a message");
            if (parsed.images.length && !options.contextManager) throw new HttpError(409, "images_unavailable", "This server does not support image attachments");
            let input = parsed.input;
            try { if (options.contextManager) input = await options.contextManager.prepare(binding.session, input, parsed.images); }
            catch { throw new HttpError(400, "context_failed", "Cannot attach these references. Check workspace paths, image support and size limits."); }
            // Admit once even if the HTTP response is lost. A throwing backend
            // may already have accepted input; never silently resubmit it.
            const admitted = { fingerprint };
            binding.submissions.set(key, admitted);
            const receipt = await binding.session.submit(input, parsed.placement);
            admitted.receipt = receipt;
            json(response, 202, { receipt });
          } finally { binding.preparingInput = false; }
          return;
        }
        if (method === "POST" && segments.length === 3 && segments[2] === "cancel") {
          const parsed = parseCancelRequest(await readJson(request));
          const receipt = await binding.cancel(parsed.cause);
          json(response, 200, { receipt });
          return;
        }
        if (method === "POST" && segments.length === 4 && segments[2] === "permissions") {
          const requestId = segments[3];
          if (!binding.pendingPermissions.has(requestId)) {
            throw new HttpError(404, "interaction_not_found", `permission request "${requestId}" is not pending`);
          }
          const capability = binding.session.capabilities.permissions;
          if (capability === undefined) {
            throw new HttpError(409, "interaction_not_supported", "session cannot answer permission requests");
          }
          const decision = parsePermissionResponse(await readJson(request));
          if (options.permissionDecisionStore) {
            try { await options.permissionDecisionStore.prepare(binding.session.ref, requestId, decision.kind); }
            catch (error) {
              options.onError?.(error);
              throw new HttpError(503, 'permission_evidence_unavailable', 'Could not prepare local permission evidence');
            }
          }
          try {
            capability.respond(requestId, decision);
          } catch {
            if (options.permissionDecisionStore) {
              try { await options.permissionDecisionStore.abort(binding.session.ref, requestId); }
              catch (error) { options.onError?.(error); }
            }
            throw new HttpError(409, "interaction_settled", `permission request "${requestId}" cannot be answered`);
          }
          if (options.permissionDecisionStore) {
            try { await options.permissionDecisionStore.commit(binding.session.ref, requestId); }
            catch (error) { options.onError?.(error); } // A prepared record keeps telemetry unknown.
          }
          json(response, 200, { receipt: { accepted: true, requestId } });
          return;
        }
        if (method === "POST" && segments.length === 4 && segments[2] === "questions") {
          const requestId = segments[3];
          if (!binding.pendingQuestions.has(requestId)) {
            throw new HttpError(404, "interaction_not_found", `question request "${requestId}" is not pending`);
          }
          const capability = binding.session.capabilities.questions;
          if (capability === undefined) {
            throw new HttpError(409, "interaction_not_supported", "session cannot answer question requests");
          }
          const answers = parseQuestionResponse(await readJson(request));
          try {
            capability.respond(requestId, answers);
          } catch {
            throw new HttpError(409, "interaction_settled", `question request "${requestId}" cannot be answered`);
          }
          json(response, 200, { receipt: { accepted: true, requestId } });
          return;
        }
        if (method === "POST" && segments.length === 5 && segments[2] === "questions" && segments[4] === "cancel") {
          const requestId = segments[3];
          if (!binding.pendingQuestions.has(requestId)) {
            throw new HttpError(404, "interaction_not_found", `question request "${requestId}" is not pending`);
          }
          const capability = binding.session.capabilities.questions;
          if (capability === undefined) {
            throw new HttpError(409, "interaction_not_supported", "session cannot cancel question requests");
          }
          const body = await readJson(request);
          if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length > 0)) {
            throw new ProtocolInputError("request body must be an empty object");
          }
          try {
            capability.cancel(requestId);
          } catch {
            throw new HttpError(409, "interaction_settled", `question request "${requestId}" cannot be cancelled`);
          }
          json(response, 200, { receipt: { accepted: true, requestId } });
          return;
        }
      }

      throw new HttpError(404, "route_not_found", "route was not found");
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const status = error instanceof HttpError
        ? error.status
        : error instanceof ProtocolInputError
          ? 400
          : 500;
      if (status === 500) options.onError?.(error);
      json(response, status, status === 500
        ? { error: { code: "internal_error", message: "Unexpected server error" } }
        : errorResource(error));
    }
  };

  const server = createNodeServer((request, response) => {
    void handler(request, response);
  });

  return Object.freeze({
    hostname,
    port,
    protocolVersion: FLAGQAI_PROTOCOL_VERSION,
    async listen() {
      if (server.listening) return server.address();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return server.address();
    },
    address() {
      return server.address();
    },
    async close() {
      await Promise.all([...sessions.values()].map((binding) => binding.dispose()));
      sessions.clear();
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  });
}
