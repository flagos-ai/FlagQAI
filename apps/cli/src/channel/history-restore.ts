/** Native presentation binding; durable restoration algorithms live in UI-core. */
import { restoreFoldedRows as restore, projectHistorySlice as project, prependHistoryRows as prepend } from '#flagqai/ui-core/history-restore'
import type { ChatRow } from '../adapter/ports/channel-view.js'
import type { AgentEvent } from '../agent/events.js'
import type { ProjectionState } from './projection.js'
import { nativeProjectionHost } from './projection.js'
import { nativeActivityHost } from './activity.js'
export { anchoredRow } from '#flagqai/ui-core/history-restore'
const host = { projection: nativeProjectionHost, activity: nativeActivityHost }
export function restoreFoldedRows(rows: ChatRow[], record: readonly AgentEvent[]): number { return restore(rows, record, host) }
export function projectHistorySlice(events: readonly AgentEvent[], thinkingFold: ProjectionState['thinkingFold']): ChatRow[] { return project(events, thinkingFold, host) }
export function prependHistoryRows(rows: ChatRow[], older: readonly ChatRow[]): number { return prepend(rows, older, host) }
