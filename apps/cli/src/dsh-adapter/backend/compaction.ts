import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { serviceForAgent } from '../presets.js'
import { dispatchTuiDecision, normalizeCancelDecision } from '../extension-events.js'
import { createNativeCompaction } from '#flagqai/harness-adapter/session-compaction'

/** Bind native compaction and extension decisions; never synthesize checkpoints. */
export function createDshCompaction(ctx: Context, agent: Agent) {
  return createNativeCompaction({
    agent,
    service: serviceForAgent<{ compactNow(agent: unknown, signal: AbortSignal): Promise<unknown> }>(ctx, agent, 'compaction'),
    decide: input => dispatchTuiDecision(ctx, 'tui/compact', input, normalizeCancelDecision),
  })
}
