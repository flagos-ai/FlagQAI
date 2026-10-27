export { createProviderManager } from './provider-manager.mjs';
/** Harness host composition. Native services are supplied by the embedding plugin. */
export { createInteractionRouter } from "./interactions.mjs";
export { createAgentResolver } from "./agent-resolution.mjs";

export async function createHarnessComposition(config, bindings) {
  await bindings.initializePresets();
  const configuredRoute = { provider: config.provider, model: config.model };
  const selected = bindings.currentModelSelection();
  const defaults = typeof selected?.provider === "string" && selected.provider.length > 0
    && typeof selected?.model === "string" && selected.model.length > 0
    ? { provider: selected.provider, model: selected.model }
    : undefined;
  const startupRoute = bindings.resolveStartupRoute(configuredRoute, defaults);
  const interactions = await bindings.createInteractions();
  try {
    const backend = bindings.createSessionBackend({
      configuredRoute,
      startupRoute,
      cwd: bindings.cwd,
      preset: config.preset,
      webControls: true,
      interactions: resolved => interactions.bind(resolved.agent),
    });
    const registry = bindings.createRegistry(backend);
    const backendHost = await bindings.createBackendHost();
    return {
      options: {
        registry,
        backendHost,
        createSessionView: bindings.createSessionView,
        modelManager: await bindings.createModelManager(agent => interactions.bind(agent)),
        contextManager: bindings.createContextManager(),
        sessionGuard: bindings.createSessionGuard(),
        ...await bindings.providerOptions(),
      },
      async dispose() {
        try { interactions.dispose(); }
        finally { await bindings.closeBackendResources(); }
      },
    };
  } catch (error) {
    // Partial startup must not leave native answerers or backend processes alive.
    try { interactions.dispose(); }
    catch (cleanupError) { bindings.onError(cleanupError); }
    try { await bindings.closeBackendResources(); }
    catch (cleanupError) { bindings.onError(cleanupError); }
    throw error;
  }
}

/** One startup/teardown owner shared by Cordis and standalone embedding hosts. */
export async function startHarnessHost({ compose, createServer, serverOptions = {}, startHeartbeat, onError = () => {} }) {
  const composition = await compose();
  let server;
  let stopHeartbeat;
  let closing;
  const close = () => closing ??= (async () => {
    try { stopHeartbeat?.(); }
    catch (error) { onError(error); }
    try { await server?.close(); }
    finally { await composition.dispose(); }
  })();
  try {
    server = createServer({ ...composition.options, ...serverOptions });
    const address = await server.listen();
    stopHeartbeat = startHeartbeat?.();
    return { server, address, close };
  } catch (error) {
    try { await close(); }
    catch (cleanupError) { onError(cleanupError); }
    throw error;
  }
}

/** Shared preset initialization for terminal and HTTP hosts. */
export async function initializeHarnessPresets({ registerBundled, ensurePackaged, warn }) {
  // Invalid native registry configuration must fail instead of removing tools.
  if (await registerBundled()) return;
  try {
    for (const result of ensurePackaged()) {
      if (result.status === "conflict") {
        warn(`FlagQAI: packaged preset "${result.id}" conflicts with an unmanaged preset`);
      }
    }
  } catch (error) {
    // Legacy read-only homes retain the official presets; resolveAgent still
    // verifies the selected composition before opening a session.
    warn(`FlagQAI: unable to install packaged presets (${String(error)})`);
  }
}

export { createWorkspaceFileScope } from './workspace-files.mjs';

export { createModelManager } from './model-manager.mjs';

export * as sessionLogFrames from './session-log/frames.mjs';
export * as sessionLogHeader from './session-log/header.mjs';
export * as sessionLogDigest from './session-log/digest.mjs';
export { createSessionIndexStore } from './session-log/store.mjs';
export { createSessionListingSnapshotStore } from './session-log/snapshot.mjs';
export { createSessionMetadataRecovery } from './session-log/recovery.mjs';
export { createSessionListing } from './session-log/list.mjs';

export { createNativeSession, isAgentSession } from './native-session.mjs';

export { createChildTranscriptReader, CHILD_TRANSCRIPT_PAGE_EVENTS } from './child-transcript.mjs';
export { createNativeJobsCapability } from './session-jobs.mjs';
export { createNativeSubagentsCapability } from './session-subagents.mjs';

export { createNativeSessionActions } from './session-actions.mjs';
export { createNativeCompaction } from './session-compaction.mjs';
export { subscribeNativeToolOutput } from './tool-output.mjs';
export { createNativeTranslator } from './native-translator.mjs';
export { createSessionMountLedger } from './session-mounts.mjs';
export { createLiveSessionCompatibility } from './live-session.mjs';
export { createPersistedSessionReader } from './persisted-session.mjs';
export { createSessionLogAccess } from './session-log-access.mjs';
export { PROJECT_SKILL_ROOTS } from './project-skills.mjs';
