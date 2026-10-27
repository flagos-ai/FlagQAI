import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import { ensureLegacySessionEventTypes } from './sessionLog.js'
import { createPersistedSessionReader, type SessionReader as SharedSessionReader } from '#flagqai/harness-adapter/persisted-session'

/** Read-only native persistence binding for legacy services and handles. */
export type SessionReader = SharedSessionReader<SessionId, SessionHeader, SessionEvent>
export const readPersistedSession = createPersistedSessionReader<SessionId, SessionHeader, SessionEvent>({
  prepare: ensureLegacySessionEventTypes,
})
