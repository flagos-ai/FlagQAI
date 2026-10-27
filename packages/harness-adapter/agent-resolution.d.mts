import type { ModelRoute } from './index.mjs';

export interface AgentResolutionInput {
  requestedSessionId?: string;
  configuredRoute: { provider?: string; model?: string };
  startupRoute: ModelRoute;
  meta: { cwd: string };
  configuredPreset?: string;
}
export type AgentMountResult =
  | { ok: true; reservation: { abandon(): void; settle(): void } }
  | { ok: false; reason: 'occupied'; holders: readonly number[] }
  | { ok: false; reason: 'busy' }
  | { ok: false; reason: 'unavailable'; detail: string };
export interface AgentResolverBindings<A, H extends { agent: A }, S> {
  explicitRoute(configured: AgentResolutionInput['configuredRoute']): ModelRoute | undefined;
  existing(sessionId: string): A | undefined;
  runningPreset(agent: A): string | undefined;
  reserveMount(sessionId: string): Promise<AgentMountResult>;
  prepareResume(): void;
  persistedPreset(sessionId: string): Promise<string | undefined>;
  composePreset(id?: string): Promise<{ agentPreset?: string; setup?: S }>;
  persistedRoute(sessionId: string): Promise<ModelRoute | undefined>;
  resume(sessionId: string, route: { provider?: string; model?: string }, setup?: S): Promise<H>;
  disposeHandle(handle: H): Promise<void>;
  reportCleanupError(error: unknown): void;
  recordedRoute(agent: A): ModelRoute | undefined;
  nextSessionId(): string;
  readPresetPref(): string | undefined;
  migratePresetPref(requested: string | undefined, resolved: string | undefined): boolean;
  validateRoute(route: ModelRoute): Promise<{ route: ModelRoute; rejected?: ModelRoute }>;
  warn(message: string): void;
  create(input: { sessionId: string; meta: { cwd: string; agentPreset?: string }; route: ModelRoute; setup?: S }): Promise<H>;
}
export interface ResolvedAgent<A, H> {
  agent: A;
  handle?: H;
  agentPreset?: string;
  route?: ModelRoute;
}
export function createAgentResolver<A, H extends { agent: A }, S>(bindings: AgentResolverBindings<A, H, S>):
  (input: AgentResolutionInput) => Promise<ResolvedAgent<A, H>>;
