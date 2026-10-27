import type { AgentBackend, BackendDetection, BackendHost } from './backend.js'

export interface AgentBackendRegistration {
  readonly id: string
  readonly load: () => Promise<AgentBackend>
}

export interface AgentBackendRegistry {
  readonly ids: readonly string[]
  load(id: string): Promise<AgentBackend>
  detect(id: string, host: BackendHost): Promise<BackendDetection>
}

/**
 * Lazy backend registry shared by local and, later, remote transports.
 *
 * Loading is cached per backend so concurrent probes and opens use the same
 * adapter instance. A failed load is evicted and can be retried after the
 * optional runtime or executable has been installed.
 */
export function createAgentBackendRegistry(
  registrations: readonly AgentBackendRegistration[],
): AgentBackendRegistry {
  const loaders = new Map<string, () => Promise<AgentBackend>>()
  for (const registration of registrations) {
    const id = registration.id.trim()
    if (id === '') throw new Error('Agent backend registration requires a non-empty id')
    if (loaders.has(id)) throw new Error(`Agent backend "${id}" is registered more than once`)
    loaders.set(id, registration.load)
  }

  const loaded = new Map<string, Promise<AgentBackend>>()
  const load = (id: string): Promise<AgentBackend> => {
    const loader = loaders.get(id)
    if (loader === undefined) throw new Error(`Unknown agent backend "${id}"`)
    const existing = loaded.get(id)
    if (existing !== undefined) return existing

    let pending: Promise<AgentBackend>
    pending = loader()
      .then(backend => {
        if (backend.id !== id) {
          throw new Error(`Agent backend registration "${id}" loaded backend "${backend.id}"`)
        }
        return backend
      })
      .catch(error => {
        if (loaded.get(id) === pending) loaded.delete(id)
        throw error
      })
    loaded.set(id, pending)
    return pending
  }

  return {
    ids: Object.freeze([...loaders.keys()]),
    load,
    async detect(id, host) {
      return (await load(id)).detect(host)
    },
  }
}
