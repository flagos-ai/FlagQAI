import type { SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * A model switch continues a human conversation only when its seed contains
 * a direct user prompt. Harness records synthetic user-role context with a
 * different source kind, so those events do not make a blank session a child.
 */
export function childRecordsLineage(seed: readonly SessionEvent[]): boolean {
  return seed.some(event => event.type === 'user/message' && event.data.source?.kind === 'user')
}
