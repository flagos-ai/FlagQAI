import type { AgentBackend, BackendHost, OpenTarget, SessionCatalog } from '../../agent/backend.js'
import type { AgentSession } from '../../agent/session.js'

export const DSH_BACKEND_ID = 'dsh'

/**
 * Adapt the host-owned Harness opener to the same contract used by optional
 * backends. The opener stays injected because route, preset, workspace and
 * mount-ledger services belong to the DSH host composition.
 */
export function createDshBackend(
  open: (target: OpenTarget, host: BackendHost) => Promise<AgentSession>,
  catalog?: SessionCatalog,
): AgentBackend {
  return {
    id: DSH_BACKEND_ID,
    descriptor: { label: 'DSH' },
    detect: async () => ({ installed: true, auth: 'unknown' }),
    open,
    ...(catalog === undefined ? {} : { catalog }),
  }
}
