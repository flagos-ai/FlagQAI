/**
 * DSH backend session: one `Agent` (plus the `AgentHandle` that owns its
 * lifetime, when this process created or resumed it) presented as an
 * `AgentSession`. Each session has its own `createDshTranslator` instance, so
 * translator state (frame fence, open calls) lives as long as the session.
 * Inbox, status and compaction-stream bus events become `pending.changed`,
 * `session.status` and `compaction.progress`.
 *
 * DSH features that have no typed capability yet reach the agent through
 * `capabilities.native.dsh` (only `src/dsh-adapter/**` may read it).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import { createUserMessage, freezeMessage, MessageId, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AgentEvent } from '../../agent/events.js'
import type { SessionCapabilities } from '../../agent/capabilities.js'
import type { AgentSession } from '../../agent/session.js'
import { isTokenDelta, tokenDeltaChars } from '../channel/usage.js'
import type { ToolsRegistryLike } from '../channel/types.js'
import { snapshotLiveSessionEvents } from '../compat/liveSession.js'
import { createDshCompaction } from './compaction.js'
import { asContextPressureView, CONTEXT_PRESSURE_PROJECTION_KEY, type ContextPressureView } from '../context-occupancy.js'
import type { ProjectionRegistryLike } from '../activity-store.js'
import { createDshSessionActions } from './session-actions.js'
import { createDshSubagentsCapability } from './subagents.js'
import { createDshJobsCapability } from './jobs.js'
import type { JobsRuntime } from '../jobs.js'
import { subscribeDshToolOutput } from './tool-output.js'
import { createDshTranslator, type DshTranslator } from './translate.js'
import type { ModelRoute } from '../../modelRoute.js'
import type { HeadlessSessionInteractions } from '../headless-interactions.js'
import { createNativeSession } from '#flagqai/harness-adapter/native-session'

declare module '#flagqai/protocol/agent/capabilities' {
  interface DshNative {
    /** The live DSH agent this session drives. */
    readonly agent: Agent
    readonly modelRoute?: ModelRoute
    /** The lifetime handle, when this session owns the agent's lifetime;
     *  absent for a borrowed registry agent (agent-view attachment). */
    readonly handle: AgentHandle | undefined
    /** The plugin context the session's listeners are installed on. */
    readonly ctx: Context
    contextPressure(): ContextPressureView | undefined
    /** Raw durable events of the main session, in arrival order. Raw
     *  listeners registered before `subscribe` run before the projector sees
     *  the same event. */
    subscribeRaw(listener: (event: SessionEvent) => void): () => void
    /** The durable session log snapshot (`/trace`, fold restore, seeds). */
    rawHistory(): readonly SessionEvent[]
    /**
     * Synchronously translate a durable replay seed with this session's
     * translator. The channel's adoption transactions replay inside a
     * synchronous tail, which the async `history()` cannot serve.
     */
    translateReplay(events: readonly SessionEvent[]): readonly AgentEvent[]
    /** Forget the translator's per-session state (paired with a projector reset). */
    resetTranslation(): void
    /** The dsh-tools presenters, scoped to this session's agent. */
    readonly presentCallView: DshTranslator['presentCallView']
    readonly presentResultView: DshTranslator['presentResultView']
  }
}

/** What a DSH session wraps: an owned handle, or an agent plus the handle
 *  this process holds for it (`undefined` = a borrowed registry agent). */
export type DshSessionTarget = AgentHandle | { readonly agent: Agent; readonly handle: AgentHandle | undefined }

/** Native bindings; shared adapter owns session coordination, not the agent loop. */
export function createDshSession(
  ctx: Context,
  target: DshSessionTarget,
  options: {
    readonly interactions?: HeadlessSessionInteractions
    readonly route?: ModelRoute
    readonly controls?: { capabilities: Pick<SessionCapabilities, 'effort' | 'modes' | 'plan'>; dispose(): void }
  } = {},
): AgentSession {
  const agent = target.agent
  const handle = 'handle' in target ? target.handle : target
  let tools: { readonly registry: ToolsRegistryLike | undefined } | undefined
  const translatorDeps = {
    tools: () => (tools ??= { registry: ctx.get('tools') as ToolsRegistryLike | undefined }).registry,
    scope: () => agent,
    attachments: () => ctx.get('attachments'),
  }
  return createNativeSession({
    agent, handle, options,
    createCompaction: () => createDshCompaction(ctx, agent),
    createTranslator: () => createDshTranslator(translatorDeps),
    createSubagents: createTranslator => createDshSubagentsCapability(ctx, agent, createTranslator),
    sessionActions: () => createDshSessionActions(ctx, agent, options.route),
    jobs: () => createDshJobsCapability(ctx.get('jobs') as JobsRuntime | undefined, agent.id),
    snapshot: () => snapshotLiveSessionEvents(agent.session),
    removePending: id => agent.inbox.remove(MessageId(id)),
    messageFor(input) {
      const native = input.native as UserMessage | undefined
      if (native !== undefined && native.id === input.clientMessageId) return native
      const message = createUserMessage({
        content: (input.blocks ?? [{ type: 'text', text: input.text }]) as ContentBlock[],
        source: { kind: 'user' },
      })
      return freezeMessage({ ...message, id: MessageId(input.clientMessageId) })
    },
    nativeBase: {
      agent, handle, ctx,
      ...(options.route === undefined ? {} : { modelRoute: options.route }),
      contextPressure(): ContextPressureView | undefined {
        try {
          const registry = ctx.get('sessionProjections') as ProjectionRegistryLike | undefined
          return asContextPressureView(registry?.snapshot(agent.session, [CONTEXT_PRESSURE_PROJECTION_KEY]).values[CONTEXT_PRESSURE_PROJECTION_KEY])
        } catch { return undefined }
      },
    },
    observePressure(listener) {
      const registry = ctx.get('sessionProjections') as ProjectionRegistryLike | undefined
      return registry?.onChanged((subject, key) => {
        if (String(subject.id) === String(agent.session.id) && key === CONTEXT_PRESSURE_PROJECTION_KEY) listener()
      }) ?? (() => {})
    },
    toolOutput: listener => subscribeDshToolOutput(ctx, agent, listener),
    isTokenDelta, tokenDeltaChars,
    events: {
      session: listener => ctx.on('session/event', listener),
      status: listener => ctx.on('agent/status', listener),
      disposed: listener => ctx.on('agent/disposed', listener),
      inserted: listener => ctx.on('agent/inbox/inserted', listener),
      claimed: listener => ctx.on('agent/inbox/claimed', listener),
      discarded: listener => ctx.on('agent/inbox/discarded', listener),
      assistantStream: listener => ctx.on('agent/assistant-stream', listener),
      llmStream: listener => ctx.on('llm/stream', listener),
    },
  })
}

export { isAgentSession } from '#flagqai/harness-adapter/native-session'

/** The lifetime handle of a DSH session this process created or resumed;
 *  throws when the session borrows its agent (or is not a DSH session). */
export function dshHandleOf(session: AgentSession): AgentHandle {
  const handle = session.capabilities.native.dsh?.handle
  if (handle === undefined) throw new Error(`flagqai: session ${session.ref.backendId}:${session.ref.sessionId} owns no DSH handle`)
  return handle
}
