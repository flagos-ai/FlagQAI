import { resolveContextOccupancy } from './context-occupancy.js'
import type { AgentSession } from '../agent/session.js'
import type { AgentEvent, AgentEventMeta, PendingItem } from '../agent/events.js'
import { createChannelProjection } from '../channel/projection.js'
import { createFileChangeReview } from '../channel/file-change-review.js'
import { MAX_ROWS } from '../channel/transcript.js'
import { recordedModelRoute } from '../modelRoute.js'
import { LOCAL_COMMANDS } from '../commands.js'
import { createInitialChannelView } from './channel/state.js'

/** Wire projection of the same reducer used by the terminal channel. No agent loop. */
export function createWebSessionView(session: AgentSession) {
  const native = session.capabilities?.native?.dsh
  // Match terminal adoption: use the recorded route on a resumed DSH session.
  const route = native === undefined ? session.capabilities?.models?.current() : native.modelRoute ?? recordedModelRoute(native.rawHistory())
  const state = {
    ...createInitialChannelView({ cwd: session.cwd, model: route?.model ?? '', provider: route?.provider ?? '' }, {
      agentId: session.ref.sessionId, sessionId: session.ref.sessionId,
      mode: { id: 'standard', label: 'Standard' }, cwdDescription: session.cwd,
    }),
    costReport: undefined,
  }
  const projector = createChannelProjection(state, {
    rowIds: { value: 1 }, backendLabel: () => session.ref.backendId,
    resetContextWarning() {}, checkContextWarning() {}, notify: () => () => undefined,
    jobs: { onOutputSeen() {}, onStarted() {} },
    inputConvergence: { cancelInFlight: false }, selectionAttached: () => undefined,
  })
  const review = createFileChangeReview(session.cwd)
  let priorReview: ReturnType<ReturnType<typeof createFileChangeReview>> | undefined
  let prior = new Map<number, string>()
  let first = true
  let queued: readonly PendingItem[] = []
  const commands = LOCAL_COMMANDS.filter(command =>
    ['new', 'resume', 'settings', 'help', 'status', 'context'].includes(command.name) || (command.name === 'compact' && session.capabilities?.compact !== undefined),
  ).map(({ name, description }) => ({ name, description }))
  const context = () => ({
    occupancy: resolveContextOccupancy(native?.contextPressure?.(), state.lastUsage, state.contextWindow, projector.contextUsage()),
    compaction: state.compaction,
    compactSupported: session.capabilities?.compact !== undefined,
  })
  return {
    snapshot() {
      return {
        type: 'session.view', reset: true,
        rows: state.rows.slice(-MAX_ROWS), removed: [],
        order: state.rows.slice(-MAX_ROWS).map(row => row.id),
        model: native?.modelRoute?.model ?? state.model, provider: native?.modelRoute?.provider ?? state.provider, title: state.sessionTitle, working: state.working,
        context: context(), tokens: state.tokens, contextWindow: state.contextWindow, tps: state.tps, commands, queued, todos: state.todos, fileReview: review(state.rows.slice(-MAX_ROWS)),
      }
    },
    apply(events: readonly AgentEvent[], meta: AgentEventMeta) {
      // Replay is a single batch so attempt/sequence ledgers reset once.
      projector.apply(events, meta)
      for (const event of events) {
        if (event.type === 'pending.changed') queued = event.items
        if (event.type === 'session.status') {
          state.working = event.status === 'running' || event.status === 'requires-action'
          if (!state.working) projector.settleStreaming()
        }
      }
      const rows = state.rows.slice(-MAX_ROWS)
      const next = new Map(rows.map(row => [row.id, JSON.stringify(row)]))
      const changed = rows.filter(row => next.get(row.id) !== prior.get(row.id))
      const removed = [...prior.keys()].filter(id => !next.has(id))
      prior = next
      const fileReview = review(state.rows.slice(-MAX_ROWS))
      const changedReview = fileReview !== priorReview
      priorReview = fileReview
      const reset = first
      first = false
      return {
        type: 'session.view', reset,
        rows: changed, removed, order: rows.map(row => row.id),
        model: native?.modelRoute?.model ?? state.model, provider: native?.modelRoute?.provider ?? state.provider, title: state.sessionTitle, working: state.working,
        context: context(), tokens: state.tokens, contextWindow: state.contextWindow, tps: state.tps,
        commands, queued, todos: state.todos, ...(reset || changedReview ? { fileReview } : {}),
      }
    },
  }
}
