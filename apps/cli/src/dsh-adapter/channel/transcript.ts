import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { toolResultPayload } from '../compat/messages.js'
import type { ChatRow, ToolResultView, ToolViewPresenter } from './types.js'
import { markChannelReadDirty } from '../../adapter/channel/read-view.js'
import { ARGS_PREVIEW_LIMIT, LOCAL_OUTPUT_LIMIT, MAX_ROWS, preview, RESULT_PREVIEW_LIMIT } from '../../channel/transcript.js'

export { ARGS_PREVIEW_LIMIT, LOCAL_OUTPUT_LIMIT, MAX_ROWS, preview, RESULT_PREVIEW_LIMIT }

const FOLD_BATCH = 40
const foldable = new Set<ChatRow['kind']>(['user', 'assistant', 'reasoning', 'tool'])

export function foldRows(
  rows: ChatRow[], cap: number,
  cursor?: { rows: unknown; index: number; head?: unknown },
  restorable?: (row: ChatRow) => boolean,
): number {
  const end = Math.max(0, rows.length - Math.max(0, cap))
  const start = cursor?.rows === rows && cursor.head === rows[0] ? Math.min(cursor.index, end) : 0
  let changed = 0
  for (let index = start; index < end; index++) {
    const row = rows[index]!
    if (row.folded || row.restored || !foldable.has(row.kind) || (restorable && !restorable(row))) continue
    row.text = preview(row.text, 200)
    if (row.tool) {
      row.tool.argsFull = undefined
      row.tool.resultFull = undefined
      row.tool.callView = undefined
      row.tool.resultView = undefined
      row.tool.liveOutput = undefined
      if (row.tool.resultText) row.tool.resultText = preview(row.tool.resultText, RESULT_PREVIEW_LIMIT)
      if (row.tool.errorText) row.tool.errorText = preview(row.tool.errorText, RESULT_PREVIEW_LIMIT)
      markChannelReadDirty(row.tool)
    }
    row.folded = true
    markChannelReadDirty(row)
    changed++
  }
  if (cursor) { cursor.rows = rows; cursor.head = rows[0]; cursor.index = end }
  if (changed) markChannelReadDirty(rows)
  return changed
}

function textBlocks(content: unknown, kind = 'text'): string {
  if (!Array.isArray(content)) return ''
  return content.flatMap(block => block && typeof block === 'object' && block.type === kind && typeof block.text === 'string' ? [block.text] : []).join('\n')
}

export function restoreRowFromEvent(row: ChatRow, event: SessionEvent): void {
  if (row.kind === 'user' && event.type === 'user/message') row.text = textBlocks(event.data.content)
  else if ((row.kind === 'assistant' || row.kind === 'reasoning') && event.type === 'assistant/message') {
    row.text = textBlocks(event.data.message.content, row.kind === 'reasoning' ? 'reasoning' : 'text')
  }
  else return
  row.folded = false
  row.restored = true
  row.fresh = false
  markChannelReadDirty(row)
}

export function toolResultText(event: SessionEvent<'tool/result'>): string {
  return textBlocks(toolResultPayload(event.data.message).content)
}

export const GOAL_RESULT_BADGE: Record<string, string> = {
  active: 'active', paused: 'paused', blocked: 'blocked', complete: 'complete',
}

export function harnessToolResultView(name: string, data: SessionEvent<'tool/result'>['data']): ToolResultView | undefined {
  const goalTool = name === 'goal' || name === 'goal_status'
  const todoTool = name === 'todo' || name === 'todo_write'
  if (!goalTool && !todoTool) return undefined
  let payload: unknown
  try { payload = JSON.parse(textBlocks(toolResultPayload(data.message).content)) } catch { return undefined }
  if (!payload || typeof payload !== 'object') return undefined
  const value = payload as Record<string, unknown>
  if (goalTool) {
    if (!value.goal || typeof value.goal !== 'object') return undefined
    const goal = value.goal as Record<string, unknown>
    if (typeof goal.objective !== 'string') return undefined
    const phase = typeof goal.phase === 'string' ? GOAL_RESULT_BADGE[goal.phase] ?? goal.phase : 'unknown'
    const rounds = Number.isInteger(goal.roundsStarted) && Number.isInteger(goal.maxGoalRounds)
      ? ` · ${goal.roundsStarted}/${goal.maxGoalRounds}` : ''
    const activation = typeof value.activation === 'string' ? ` · ${value.activation}` : ''
    return { card: 'generic', content: [
      { type: 'text', text: `🎯 ${goal.objective}` },
      { type: 'text', text: `● ${phase}${rounds}${activation}` },
    ] }
  }
  if (!Array.isArray(value.todos)) return undefined
  const completed = value.todos.filter((todo: unknown) => todo && typeof todo === 'object' && (todo as { status?: unknown }).status === 'completed').length
  const active = value.todos.find((todo: unknown) => todo && typeof todo === 'object' && (todo as { status?: unknown }).status === 'in_progress') as { content?: unknown } | undefined
  return { card: 'generic', content: [
    { type: 'text', text: `todos ✓ ${completed}/${value.todos.length}` },
    { type: 'text', text: `● ${typeof active?.content === 'string' ? active.content : ''}` },
  ] }
}

export function toolErrorText(event: SessionEvent<'tool/result'>): string {
  const error = event.data.error
  if (error) {
    const label = [error.name, error.code].filter(Boolean).join(': ')
    const detail = toolResultText(event)
    return detail || error.reason ? `${label} — ${detail || error.reason}` : label
  }
  return toolResultPayload(event.data.message).isError ? toolResultText(event) : ''
}

export function restoreToolResult(row: ChatRow, event: SessionEvent<'tool/result'>): void {
  if (!row.tool) return
  const error = toolErrorText(event)
  const result = toolResultText(event)
  const failed = event.data.error !== undefined || toolResultPayload(event.data.message).isError
  row.tool.status = failed ? 'error' : 'ok'
  row.tool.errorText = failed ? error : undefined
  row.tool.resultFull = failed ? undefined : result
  row.tool.resultText = failed ? undefined : preview(result, RESULT_PREVIEW_LIMIT)
  if (failed) row.tool.resultView = undefined
  row.tool.liveOutput = undefined
  row.folded = false
  row.restored = true
  row.fresh = false
  markChannelReadDirty(row.tool)
  markChannelReadDirty(row)
}

export function foldBack(rows: ChatRow[], events: readonly SessionEvent[], views?: ToolViewPresenter): number {
  const target = rows.filter(row => row.folded).slice(-FOLD_BATCH)
  if (target.length === 0) return 0
  const bySeq = new Map<number, SessionEvent>(events.map(event => [Number(event.seq), event]))
  const results = new Map<string, SessionEvent<'tool/result'>>()
  for (const event of events) if (event.type === 'tool/result') {
    const message = event.data.message as { toolCallId?: string; content?: readonly { toolCallId?: string }[] }
    const ids = [message.toolCallId, ...(message.content ?? []).map(block => block.toolCallId)]
    for (const id of ids) if (typeof id === 'string') results.set(id, event)
  }
  let restored = 0
  for (const row of target) {
    const event = row.seq === undefined ? undefined : bySeq.get(row.seq)
    if (!event) continue
    if (row.kind === 'tool' && row.tool && event.type === 'tool/call') {
      row.tool.argsFull = event.data.arguments
      row.tool.callView = views?.call(event.data.name, event.data.arguments)
      const result = results.get(String(event.data.callId))
      if (result) {
        restoreToolResult(row, result)
        if (row.tool.status === 'ok') row.tool.resultView = views?.result(event.data.name, event.data.arguments, result.data)
      } else { row.folded = false; row.restored = true; row.fresh = false }
      markChannelReadDirty(row.tool)
      markChannelReadDirty(row)
      restored++
    } else if (row.kind === 'user' || row.kind === 'assistant' || row.kind === 'reasoning') {
      restoreRowFromEvent(row, event)
      if (!row.folded) restored++
    }
  }
  if (restored) markChannelReadDirty(rows)
  return restored
}

export function prepareReplayEvents(events: readonly SessionEvent[]): SessionEvent[] {
  const settled = new Set<string>()
  for (const event of events) if (event.type === 'assistant/message') settled.add(`${event.data.turn}:${event.data.step}`)
  return events.filter(event => {
    if ((event as { type: string }).type !== 'assistant/chunk') return true
    const data = (event as unknown as { data: { turn?: unknown; step?: unknown } }).data
    return !settled.has(`${data.turn}:${data.step}`)
  })
}
