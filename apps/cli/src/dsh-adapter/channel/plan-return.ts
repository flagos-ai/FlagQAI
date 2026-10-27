import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionModeSpec } from '../../sessionModes.js'

/** Client mode-composition metadata, not a second plan state or approval.
 * Captured before canonicalization so a resumed review returns to the same
 * native permission identity and atoms as the terminal originally selected. */
export interface PlanReturn extends SessionModeSpec { readonly permission?: string }
export const PLAN_RETURN_EVENT = 'flagqai/plan-return'

export function readPlanReturn(events: readonly SessionEvent[], closing = false): PlanReturn | undefined {
  let end = events.length
  if (closing) {
    end = events.findLastIndex(event => (event as { type: string }).type === 'plan/mode' && (event.data as unknown as { active: boolean }).active === true)
    if (end < 0) return undefined
  }
  for (let index = end - 1; index >= 0; index--) {
    const event = events[index]!
    const type = (event as { type: string }).type
    if (type === 'plan/mode' && (event.data as unknown as { active: boolean }).active === false) break
    if (type !== PLAN_RETURN_EVENT) continue
    const data = event.data as unknown as Record<string, unknown>
    return { id: 'restore',
      ...(typeof data.permission === 'string' ? { permission: data.permission } : {}),
      ...(data.sandbox === 'read-only' || data.sandbox === 'workspace-write' || data.sandbox === 'danger-full-access' ? { sandbox: data.sandbox } : {}),
      ...(data.approval === 'ask' || data.approval === 'never' ? { approval: data.approval } : {}),
    }
  }
  return undefined
}

/** An explicit native /plan off owns its target policies even if the client
 * was recreated while the command's exit was queued for the next step. */
export function explicitPlanExitInLog(events: readonly SessionEvent[]): boolean {
  let commandId: unknown
  let explicit = false
  for (const event of events) {
    const type = (event as { type: string }).type
    const data = event.data as unknown as Record<string, unknown>
    if (type === 'plan/mode' && data.active === true) { explicit = false; commandId = undefined }
    if (type === 'command/run' && data.name === 'plan' && typeof data.args === 'string' && data.args.trim() === 'off') {
      explicit = true; commandId = data.commandId
    }
    if (type === 'command/done' && data.commandId === commandId && data.kind !== 'success') explicit = false
  }
  return explicit
}
