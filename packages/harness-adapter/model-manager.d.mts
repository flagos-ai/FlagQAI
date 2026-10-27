import type { ModelRoute } from './index.mjs';
export interface ModelRef { readonly provider?: string; readonly model: string }
export interface ModelOption { readonly provider?: string; readonly id: string; readonly label: string; readonly description?: string }
export interface ModelSession {
  readonly status: string;
  readonly ref: { readonly backendId: string; readonly sessionId: string };
  readonly capabilities: {
    readonly models?: {
      current(): ModelRef;
      list(): Promise<readonly ModelOption[]>;
      set(ref: ModelRef): Promise<{ readonly kind: 'switched' } | { readonly kind: 'refused'; readonly reason: string }>;
    };
  };
  dispose(): void | Promise<void>;
}
export interface ModelManager<S extends ModelSession> {
  commit(session: S): void;
  release(session: S): void;
  list(session: S): Promise<{ available: boolean; current?: ModelRef; models: readonly ModelOption[] }>;
  switch(session: S, ref: ModelRef): Promise<S>;
}
export interface ModelManagerBindings<S extends ModelSession, H extends { dispose(): void | Promise<void> }, P> {
  commitRoute(session: S): ModelRoute | undefined;
  currentRoute(session: S): ModelRoute | undefined;
  selectModel(provider: string, model: string): boolean;
  releaseMount(sessionId: string): void;
  listProviders(): readonly { id: string; name: string }[];
  listModels(provider: string): Promise<readonly { id: string; name?: string }[]>;
  prepare(session: S): Promise<P>;
  newSessionId(): string;
  reserve(sessionId: string): Promise<{ settle(): void; abandon(): void }>;
  create(session: S, sessionId: string, prepared: P, route: ModelRoute): Promise<H>;
  recordSelection(handle: H, route: ModelRoute): void;
  wrap(handle: H, route: ModelRoute): Promise<S>;
  attach(session: S, sessionId: string): Promise<void>;
  reportCleanupError(error: unknown): void;
}
export function createModelManager<S extends ModelSession, H extends { dispose(): void | Promise<void> }, P>(bindings: ModelManagerBindings<S, H, P>): ModelManager<S>;
