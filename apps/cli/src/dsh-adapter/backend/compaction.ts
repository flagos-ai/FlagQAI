import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { serviceForAgent } from '../presets.js'
import { dispatchTuiDecision, normalizeCancelDecision } from '../extension-events.js'
import { createCompactionPolicy } from '#flagqai/harness-adapter/compaction-policy'
import { createNativeCompaction } from '#flagqai/harness-adapter/session-compaction'

/** Bind native compaction and extension decisions; never synthesize checkpoints. */
export function createDshCompaction(ctx: Context, agent: Agent) {
  const service = serviceForAgent<{ compactNow(agent: unknown, signal: AbortSignal): Promise<unknown> }>(ctx, agent, 'compaction')
  const native = createNativeCompaction({
    agent,
    service,
    decide: input => dispatchTuiDecision(ctx, 'tui/compact', input, normalizeCancelDecision),
  })
  const policy = service === undefined ? undefined : createCompactionPolicy({ agent, service })
  return { ...native, capability: native.capability === undefined ? undefined : { ...native.capability, ...(policy === undefined ? {} : { policy }) } }
}
