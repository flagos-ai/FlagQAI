export type { ProviderDraft, ProviderConfiguration, ProviderManager, ProviderSetupHost } from './provider-manager.mjs';
export { createProviderManager } from './provider-manager.mjs';
/** Interfaces between an embedding native plugin and shared host composition. */
export { createInteractionRouter } from './interactions.mjs';
export type { InteractionStores, InteractionEvent, SessionInteractions } from './interactions.mjs';
export { createAgentResolver } from './agent-resolution.mjs';
export type { AgentResolutionInput, AgentMountResult, AgentResolverBindings, ResolvedAgent } from './agent-resolution.mjs';

export interface HostConfig {
  provider?: string;
  model?: string;
  preset?: string;
}
export interface ModelRoute { provider: string; model: string }
export interface HarnessComposition {
  options: Record<string, unknown>;
  dispose(): Promise<void>;
}
export interface HarnessBindings<Agent, Interaction, Backend> {
  cwd: string;
  initializePresets(): Promise<void>;
  currentModelSelection(): { provider?: unknown; model?: unknown } | undefined;
  resolveStartupRoute(configured: HostConfig, defaults?: ModelRoute): ModelRoute;
  createInteractions(): { bind(agent: Agent): Interaction; dispose(): void } | Promise<{ bind(agent: Agent): Interaction; dispose(): void }>;
  createSessionBackend(options: {
    configuredRoute: HostConfig;
    startupRoute: ModelRoute;
    cwd: string;
    preset?: string;
    webControls: boolean;
    interactions(resolved: { agent: Agent }): Interaction;
  }): Backend;
  createRegistry(backend: Backend): unknown;
  createBackendHost(): Promise<unknown>;
  createSessionView: unknown;
  createModelManager(bind: (agent: Agent) => Interaction): unknown;
  createContextManager(): unknown;
  createSessionGuard(): unknown;
  providerOptions(): Record<string, unknown> | Promise<Record<string, unknown>>;
  closeBackendResources(): Promise<void>;
  onError(error: unknown): void;
}
export function createHarnessComposition<A, I, B>(config: HostConfig, bindings: HarnessBindings<A, I, B>): Promise<HarnessComposition>;
export interface HostServer {
  listen(): Promise<{ port: number } | string | null>;
  close(): Promise<void>;
}
export function startHarnessHost<S extends HostServer>(input: {
  compose(): Promise<HarnessComposition>;
  createServer(options: Record<string, unknown>): S;
  serverOptions?: Record<string, unknown>;
  startHeartbeat?(): () => void;
  onError?(error: unknown): void;
}): Promise<{ server: S; address: Awaited<ReturnType<S['listen']>>; close(): Promise<void> }>;
export function initializeHarnessPresets(input: {
  registerBundled(): Promise<boolean>;
  ensurePackaged(): Iterable<{ id: string; status: string }>;
  warn(message: string): void;
}): Promise<void>;

export { createWorkspaceFileScope } from './workspace-files.mjs';
export type { WorkspaceFileSystem } from './workspace-files.mjs';

export { createModelManager } from './model-manager.mjs';
export type { ModelManager, ModelManagerBindings, ModelSession } from './model-manager.mjs';

export * as sessionLogFrames from './session-log/frames.mjs';
export * as sessionLogHeader from './session-log/header.mjs';
export * as sessionLogDigest from './session-log/digest.mjs';
export { createSessionIndexStore } from './session-log/store.mjs';
export type { SessionIndexStore, SessionIndex, IndexEntry, DerivedEntry } from './session-log/store.mjs';
export { createSessionListingSnapshotStore } from './session-log/snapshot.mjs';
export { createSessionMetadataRecovery } from './session-log/recovery.mjs';
export { createSessionListing } from './session-log/list.mjs';
export type { SessionSummary } from './session-log/listing-types.mjs';
export type { SessionSource, SessionListing, SessionListingBindings } from './session-log/list.mjs';
export type { SessionListingSnapshotStore } from './session-log/snapshot.mjs';
export type { SessionMetadataRecovery } from './session-log/recovery.mjs';
