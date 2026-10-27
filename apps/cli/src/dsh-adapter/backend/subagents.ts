import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { carrierKeyOf } from '@deepseek-ai/dsh-scope'
import type { SubagentsServiceView } from '../channel/subagent-projection.js'
import { readChildTranscriptPage, type ChildPersistenceSource, type ChildSessionsStore } from '../channel/subagent-transcript.js'
import type { DshTranslator } from './translate.js'
import { createNativeSubagentsCapability } from '#flagqai/harness-adapter/session-subagents'

/** Bind the host catalog, public persistence and carrier-scoped native events. */
export function createDshSubagentsCapability(ctx: Context, agent: Agent, createTranslator: () => DshTranslator) {
  return createNativeSubagentsCapability({
    agent, createTranslator, readChildTranscriptPage,
    service: () => ctx.get('subagents' as never) as SubagentsServiceView | undefined,
    lookupChild: id => (ctx.get('agents') as { get(id: string): { status?: string; session?: unknown; options?: { model?: string } } | undefined } | undefined)?.get(id),
    persistence: () => ctx.get('sessionPersistence') as ChildPersistenceSource | undefined,
    sessionsStore: () => ctx.get('sessions') as ChildSessionsStore | undefined,
    carrierKeyOf,
    onStart: listener => ctx.on('subagent/start' as never, listener as never),
    onEnd: listener => ctx.on('subagent/end' as never, listener as never),
  })
}
