import type { PermissionDecision } from '../agent/capabilities.js'
import type { PermissionOptionView, PermissionOutcome, PermissionRequestView } from '../agent/events.js'

export type PermissionPanelOutcome = 'allowed-once' | 'allowed-always' | 'rejected'

export interface PermissionPanelDecision {
  readonly optionId: string
  readonly kind: PermissionOptionView['kind']
  readonly feedback?: string
  readonly key?: string
}

export interface PermissionPanelSnapshot {
  readonly key: string
  readonly toolName: string
  readonly agentId: string
  readonly title?: string
  readonly command?: string
  readonly reason?: string
  readonly description?: string
  readonly blockedPath?: string
  readonly subagentId?: string
  readonly external?: true
  readonly options?: readonly PermissionOptionView[]
  readonly defaultToNo?: boolean
  readonly suppressAlwaysAllow?: boolean
  readonly matchedAskRule?: boolean
  readonly feedback?: boolean
}

export interface PermissionPanelSource {
  subscribe(listener: () => void): () => void
  getSnapshot(): PermissionPanelSnapshot | null
  decide(outcome: PermissionPanelOutcome, decision?: PermissionPanelDecision): void
}

export interface PermissionAsk {
  readonly sessionId: string
  readonly request: PermissionRequestView
  settle(outcome: PermissionOutcome, decision?: PermissionDecision): void
}

export const DEFAULT_PERMISSION_OPTIONS: readonly PermissionOptionView[] = Object.freeze([
  Object.freeze({ id: 'allow-once', kind: 'allow-once' }),
  Object.freeze({ id: 'reject', kind: 'reject' }),
])

export function panelOutcomeOf(kind: PermissionOptionView['kind']): PermissionPanelOutcome {
  if (kind === 'allow-once') return 'allowed-once'
  if (kind === 'allow-always') return 'allowed-always'
  return 'rejected'
}

export function visiblePermissionOptions(
  prompt: Pick<PermissionPanelSnapshot, 'options' | 'defaultToNo' | 'suppressAlwaysAllow' | 'matchedAskRule'>,
): readonly PermissionOptionView[] {
  const options = prompt.options ?? DEFAULT_PERMISSION_OPTIONS
  const filtered = prompt.suppressAlwaysAllow || prompt.matchedAskRule
    ? options.filter(option => option.kind !== 'allow-always')
    : options
  if (!prompt.defaultToNo) return filtered
  return [...filtered.filter(option => option.kind === 'reject'), ...filtered.filter(option => option.kind !== 'reject')]
}

type Entry = { readonly identity: string; readonly ask: PermissionAsk; readonly panelKey: string }

function identityOf(sessionId: string, requestId: string): string {
  return JSON.stringify([sessionId, requestId])
}

function settleSafely(entry: Entry, outcome: PermissionOutcome, decision?: PermissionDecision): void {
  try { entry.ask.settle(outcome, decision) } catch { /* A failed backend callback cannot block the queue. */ }
}

function panelFor(entry: Entry): PermissionPanelSnapshot {
  const { sessionId, request } = entry.ask
  return Object.freeze({
    key: entry.panelKey,
    toolName: request.toolName,
    agentId: sessionId,
    title: request.title,
    command: request.command,
    reason: request.reason,
    description: request.description,
    blockedPath: request.blockedPath,
    subagentId: request.agentId,
    options: Object.freeze(request.options.map(option => Object.freeze({ ...option }))),
    defaultToNo: request.defaultToNo,
    suppressAlwaysAllow: request.suppressAlwaysAllow,
    matchedAskRule: Boolean(request.matchedAskRule),
    feedback: request.feedback,
  })
}

/** Session-scoped FIFO: only a choice on the active panel returns a verdict. */
export class PermissionStore implements PermissionPanelSource {
  private readonly entries: Entry[] = []
  private readonly listeners = new Set<() => void>()
  private nextKey = 0
  private shown: Entry | undefined
  private snapshot: PermissionPanelSnapshot | null = null

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot(): PermissionPanelSnapshot | null { return this.snapshot }

  pending(): readonly PermissionRequestView[] {
    return this.entries.map(entry => entry.ask.request)
  }

  pendingAgentIds(): readonly string[] {
    return [...new Set(this.entries.map(entry => entry.ask.sessionId))]
  }

  pendingAgentDetail(sessionId: string): { readonly toolName: string; readonly reason?: string; readonly command?: string } | undefined {
    const request = this.entries.find(entry => entry.ask.sessionId === sessionId)?.ask.request
    return request && { toolName: request.toolName, reason: request.reason, command: request.command }
  }

  park(ask: PermissionAsk): void {
    const identity = identityOf(ask.sessionId, ask.request.requestId)
    const entry: Entry = { identity, ask, panelKey: `permission:${++this.nextKey}` }
    if (this.entries.some(queued => queued.identity === identity)) {
      settleSafely(entry, 'cancelled')
      return
    }
    this.entries.push(entry)
    this.refresh()
  }

  decide(outcome: PermissionPanelOutcome, picked?: PermissionPanelDecision): void {
    const entry = this.entries[0]
    const panel = this.snapshot
    if (!entry || !panel || (picked?.key !== undefined && picked.key !== panel.key)) return
    const requestedKind = outcome === 'allowed-once' ? 'allow-once'
      : outcome === 'allowed-always' ? 'allow-always' : 'reject'
    const options = visiblePermissionOptions(panel)
    const selected = picked
      ? options.find(option => option.id === picked.optionId && option.kind === picked.kind && option.kind === requestedKind)
      : options.find(option => option.kind === requestedKind)
    const verdict: PermissionDecision = selected && requestedKind !== 'reject'
      ? requestedKind === 'allow-always'
        ? { kind: 'allow-always', optionId: selected.id }
        : { kind: 'allow-once' }
      : { kind: 'reject', ...(picked?.feedback?.trim() ? { message: picked.feedback.trim() } : {}) }
    this.entries.shift()
    this.refresh()
    settleSafely(entry, verdict.kind === 'reject' ? 'rejected' : verdict.kind, verdict)
  }

  withdraw(sessionId: string, requestId: string): boolean {
    const index = this.entries.findIndex(entry => entry.identity === identityOf(sessionId, requestId))
    if (index < 0) return false
    const [entry] = this.entries.splice(index, 1)
    this.refresh()
    settleSafely(entry!, 'cancelled')
    return true
  }

  withdrawSession(sessionId: string): void {
    this.withdrawMatching(entry => entry.ask.sessionId === sessionId)
  }

  settleAll(): void {
    this.withdrawMatching(() => true)
  }

  private withdrawMatching(matches: (entry: Entry) => boolean): void {
    const removed = this.entries.filter(matches)
    if (!removed.length) return
    for (let index = this.entries.length - 1; index >= 0; index--) {
      if (matches(this.entries[index]!)) this.entries.splice(index, 1)
    }
    this.refresh()
    for (const entry of removed) settleSafely(entry, 'cancelled')
  }

  private refresh(): void {
    const active = this.entries[0]
    if (this.shown !== active) {
      this.shown = active
      this.snapshot = active ? panelFor(active) : null
    }
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* A subscriber cannot block permission settlement. */ }
    }
  }
}
