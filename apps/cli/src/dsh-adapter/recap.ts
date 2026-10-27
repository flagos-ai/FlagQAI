import type { SessionEvent } from '@deepseek-ai/dsh-session'

export type { RecapOutcome } from '../adapter/ports/channel-catalog.js'
export { parseRecapResponse, wrapRecapPrompt } from '../channel/side-prompts.js'

/** Maximum conversation text sent to the tool-less recap call. */
export const RECAP_RECENT_CHARS = 6000

const RECENT_MESSAGES = 12

/**
 * Build a short, chronological conversation excerpt without including tool
 * calls, reasoning, or UI rows. Reserve the budget from the newest message
 * backward so an older long prompt cannot hide the latest exchange.
 */
export function collectRecentActivity(events: readonly SessionEvent[], limitChars: number): string {
  if (!Number.isFinite(limitChars) || limitChars <= 0) return ''
  const budget = Math.floor(limitChars)
  const rows: string[] = []
  let used = 0

  for (let index = events.length - 1; index >= 0 && rows.length < RECENT_MESSAGES; index -= 1) {
    const event = events[index]
    if (event.type !== 'user/message' && event.type !== 'assistant/message') continue
    const blocks = event.type === 'user/message' ? event.data.content : event.data.message.content
    const text = blocks
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (text === '') continue

    const prefix = event.type === 'user/message' ? 'user: ' : 'assistant: '
    const separatorLength = rows.length === 0 ? 0 : 1
    const remaining = budget - used - separatorLength - prefix.length
    if (remaining <= 0) break
    const excerpt = text.length > remaining ? text.slice(-remaining) : text
    rows.unshift(prefix + excerpt)
    used += separatorLength + prefix.length + excerpt.length
    if (excerpt.length < text.length) break
  }
  return rows.join('\n')
}
