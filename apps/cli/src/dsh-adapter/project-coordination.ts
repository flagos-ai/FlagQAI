/** Bind research coordination to the public native activation and persistence APIs. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createProjectCoordinator } from '#flagqai/harness-adapter/project-coordination'
import type { ChildPersistenceSource } from '#flagqai/harness-adapter/child-transcript'

export function createNativeResearchCoordinator(ctx: Context, agent: Agent) {
  type NativeWorkers = {
    listChildren(parent: string, signal: AbortSignal): Promise<readonly { id: string }[]>
    startActivation(spec: unknown): Promise<{ childId: string; result: Promise<{ stopReason?: string }> }>
  }
  const service = () => ctx.get('subagents' as never) as NativeWorkers | undefined
  const controller = new AbortController()
  ctx.effect(() => () => controller.abort())
  return createProjectCoordinator({
    sessionId: String(agent.id), signal: controller.signal,
    available: () => typeof service()?.startActivation === 'function' && typeof service()?.listChildren === 'function'
      && Boolean(ctx.get('sessionQuery' as never)) && Boolean(ctx.get('sessionPersistence')),
    start(id, label, prompt, signal) {
      const native = service()
      if (!native) throw new Error('Native worker service is unavailable.')
      return native.startActivation({ provider: 'spawn', label, childId: SessionId(id), delivery: 'parent', signal,
        request: { parent: agent, prompt: [{ type: 'text', text: prompt }] } })
    },
    async observe(id, signal) {
      const children = await service()!.listChildren(String(agent.id), signal)
      if (!children.some(child => child.id === id))
        return { status: 'unknown', revision: 'not-cataloged', detail: 'Native admission is unresolved. No work was resubmitted.' }
      const live = ctx.agents.get(SessionId(id))
      if (live?.status === 'running') return { status: 'running', revision: `live-${live.session.seq}` }
      const persistence = ctx.get('sessionPersistence') as ChildPersistenceSource | undefined
      if (!persistence) return { status: 'unknown', revision: 'no-persistence', detail: 'Native persistence is unavailable.' }
      const stat = await persistence.stat?.(id, { signal })
      let count = typeof stat?.eventCount === 'number' ? stat.eventCount : undefined
      const handle = await persistence.open(id, 'read', { signal })
      try {
        if (String(handle.header.id) !== id || String(handle.header.parentSession) !== String(agent.id))
          throw new Error('Stored native worker does not belong to this coordinator.')
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
          // JSONL may omit eventCount. Locate its end using bounded range probes.
          let low = 0, high = 1
          const present = async (offset: number) => (await handle.read(offset, 1, { signal })).events.length > 0
          while (await present(high)) {
            low = high
            high *= 2
            if (high > 1048576) throw new Error('Native worker history exceeds the recovery probe limit.')
          }
          while (high - low > 1) {
            const mid = Math.floor((low + high) / 2)
            if (await present(mid)) low = mid
            else high = mid
          }
          count = await present(0) ? high : 0
        }
        const page = await handle.read(Math.max(0, count - 200), 200, { signal })
        const event = page.events.findLast(event => event.type === 'turn/end' || event.type === 'turn/start')
        const reason = (event?.data as { reason?: { kind?: string } } | undefined)?.reason?.kind
        return { status: event?.type === 'turn/end' ? (reason === 'completed' ? 'completed' : 'failed') : 'interrupted',
          revision: String(count), detail: event ? JSON.stringify(event).slice(0, 4096) : 'No terminal native turn is recorded. No work was resubmitted.' }
      } finally { await handle.close() }
    },
    onError: error => ctx.logger.warn(`Research worker metadata requires recovery: ${String(error)}`),
  })
}
