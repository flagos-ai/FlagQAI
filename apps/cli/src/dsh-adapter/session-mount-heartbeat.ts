/** Publish live Harness session ownership to the cross-process mount ledger. */
import type { Context } from '@deepseek-ai/cordis'
import { clearOwnMounts, publishMounts } from '../sessionMounts.js'

interface LiveAgent {
  readonly id: string
}

interface AgentRoster {
  list(): readonly LiveAgent[]
}

interface HeartbeatSource {
  readonly ctx: Context
  readonly extra: () => Iterable<string>
  last: string[]
}

const sources = new Set<HeartbeatSource>()
const PERIOD_MS = 5_000
let timer: ReturnType<typeof setInterval> | undefined

function sessionIds(ctx: Context): string[] {
  const roster = ctx.get('agents') as AgentRoster | undefined
  if (roster === undefined) return []
  return roster.list()
    .map(agent => agent.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/** Snapshot the current live Agent roster without changing ledger ownership. */
export function mountedSessionIds(ctx: Context): string[] {
  return [...new Set(sessionIds(ctx))]
}

function refresh(): void {
  const combined = new Set<string>()
  for (const source of sources) {
    try {
      const ids = [...mountedSessionIds(source.ctx), ...source.extra()]
      source.last = [...new Set(ids.filter(id => typeof id === 'string' && id.length > 0))]
    } catch {
      // A transient roster or channel failure must not release a live claim.
    }
    for (const id of source.last) combined.add(id)
  }
  publishMounts(combined)
}

/**
 * One publisher serves every mounted host in this process. Disposing one host
 * removes only its contribution; the final disposer clears process ownership.
 */
export function startSessionMountHeartbeat(
  ctx: Context,
  extra: () => Iterable<string> = () => [],
): () => void {
  const source: HeartbeatSource = { ctx, extra, last: [] }
  sources.add(source)
  refresh()
  if (timer === undefined) {
    timer = setInterval(refresh, PERIOD_MS)
    timer.unref?.()
  }

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    sources.delete(source)
    if (sources.size > 0) {
      refresh()
      return
    }
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    clearOwnMounts()
  }
}
