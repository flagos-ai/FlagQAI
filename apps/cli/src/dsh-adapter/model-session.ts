import type { CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { ensureLegacySessionEventTypes } from './compat/sessionLog.js'
import { liveSessionCreateOptions } from './compat/index.js'
import { childRecordsLineage } from './channel/session-lineage.js'

/** CLI and HTTP model switches inherit the same durable prefix and lineage. */
export function modelSessionOptions(input: {
  sessionId: SessionId
  seed: readonly SessionEvent[]
  source: Session
  cwd: string
  provider: string
  model: string
  agentPreset?: string
  setup?: CreateAgentOptions['setup']
}): CreateAgentOptions {
  return liveSessionCreateOptions({
    sessionId: input.sessionId,
    seed: input.seed,
    runtimeSession: input.source,
    inheritedCount: input.seed.length,
    cwd: input.cwd,
    parentSession: childRecordsLineage(input.seed) ? input.source.id : undefined,
    agentPreset: input.agentPreset,
    agentOptions: { provider: input.provider, model: input.model },
    setup: input.setup,
  })
}

/** Persist selection separately from requests, including before the first turn. */
export function recordModelSelection(session: Session, provider: string, model: string): void {
  ensureLegacySessionEventTypes()
  ;(session as unknown as { append(type: string, data: unknown): void }).append('flagqai/model-selected', { provider, model })
}
