export interface ProviderDraft {
  kind: 'catalog' | 'custom'
  route: string
  baseURL?: string
  api?: string
  apiKey?: string
}

export interface ProviderConfiguration extends ProviderDraft {
  models: readonly string[]
}

export interface ProviderManager {
  status(): Promise<{
    ready: boolean
    catalog: readonly { route: string; label: string }[]
    configured: readonly {
      route: string
      kind: 'catalog' | 'custom'
      baseURL?: string
      api?: string
      models: readonly string[]
      keyConfigured: boolean
    }[]
  }>
  discover(input: ProviderDraft): Promise<readonly {
    id: string
    name?: string
    contextWindow?: number
    maxTokens?: number
  }[]>
  configure(input: ProviderConfiguration): Promise<{
    route: string
    model: string
    keyConfigured: boolean
  }>
}

/** Native configuration and credential operations remain owned by the host. */
export interface ProviderSetupHost {
  listCatalogProviders(): readonly { provider: string; displayName: string }[];
  listConfiguredProviders(options?: { effective?: boolean }): readonly {
    route: string; ref: string; isCatalog: boolean; baseURL?: string; api?: string;
    models?: readonly string[]; modelEntries?: readonly Record<string, unknown>[];
  }[];
  routeExists(route: string): boolean;
  discoverModels(request: { provider?: string; baseURL?: string; api?: string; apiKey?: string }): Promise<readonly {
    id: string; name?: string; contextWindow?: number; maxTokens?: number;
  }[]>;
  envShadows(ref: string): boolean;
  readCredential(ref: string): Promise<string | undefined>;
  writeCredential(ref: string, value: string): void | Promise<void>;
  removeCredential(ref: string): void | Promise<void>;
  writeProfile(route: string, profile: Record<string, unknown>): Promise<void>;
  mutateProfile(route: string, ops: readonly { op: 'set'; path: readonly string[]; value: unknown }[]): Promise<void>;
}
export function createProviderManager(host: ProviderSetupHost, selectModel: (provider: string, model: string) => boolean, deriveKeyRef: (route: string) => string): ProviderManager;
