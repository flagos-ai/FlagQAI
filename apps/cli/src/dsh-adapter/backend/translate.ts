/** Native bindings for shared durable/live event translation.
 * The exhaustive event capability classification and pricing policy remain
 * native; shared translation owns replay and per-session stream state. */
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AgentEventType } from '../../agent/events.js'
import type { PricingWindow } from '../../channel/usage.js'
import { isPeakHour } from '../../deepseekPricing.js'
import { BACKGROUND_START_ACK, isSubagentToolName, parseJobOutputId, todoPanelItems, toolCommandOf } from '../channel/projection-helpers.js'
import { harnessToolResultView, prepareReplayEvents, toolErrorText } from '../channel/transcript.js'
import type { ToolsRegistryLike } from '../channel/types.js'
import { isCompactionCheckpointSource, toolResultPayload } from '../compat/messages.js'
import { transcriptImagesOf } from '../transcript-images.js'
import { createNativeTranslator, type NativeTranslator } from '#flagqai/harness-adapter/native-translator'

export interface DshTranslatorDeps {
  /** The host-plane tools registry (dsh-tools); absent in bare embedders,
   *  where every presenter call falls back to a plain text card. Read per
   *  presenter call (a session wrapper memoizes it). */
  tools(): ToolsRegistryLike | undefined
  /** Presenter scope: the live agent, so preset-owned tool definitions
   *  resolve (the dsh-host-apiproxy presenter pattern). Read per call. */
  scope(): unknown
  /** DSH attachment service, resolved at call time (a late-mounted provider
   *  must still serve images for rows projected earlier). */
  attachments(): unknown
}

/**
 * DeepSeek's rate windows, injected into the shared projector as its
 * `pricingWindow`: each usage buckets by the time its request ran.
 */
export function dshPricingWindow(time: number): PricingWindow {
  return isPeakHour(new Date(time)) ? 'peak' : 'idle'
}

/**
 * The DSH backend's decision for every Agent Domain event type: whether this
 * translator (or its session, for the bus-derived `session.status`,
 * `pending.changed` and `compaction.progress`) ever emits it. The exhaustive
 * switch is the point: a new `AgentEvent` variant fails `tsc` here until the
 * DSH side decides, and `verify:agent-domain` checks every translated fixture
 * event against it.
 */
export function dshEmits(type: AgentEventType): boolean {
  switch (type) {
    case 'session.title':
    case 'session.color':
    case 'session.status':
    case 'turn.start':
    case 'turn.end':
    case 'step.start':
    case 'step.end':
    case 'user.message':
    case 'pending.changed':
    case 'assistant.attempt.start':
    case 'assistant.delta':
    case 'assistant.attempt.end':
    case 'assistant.message':
    case 'tool.call':
    case 'tool.result':
    case 'tool.output': // Session-owned native job-ring observer.
    case 'task.start':
    case 'task.output':
    case 'compaction.start':
    case 'compaction.progress':
    case 'compaction.end':
    case 'context.capacity':
    case 'goal.change':
    case 'todo.write':
    case 'preset.selected':
    case 'system.prompt':
    case 'request.header':
    case 'custom':
      return true
    // Owned elsewhere on DSH (subagent/job extensions, approval and question
    // stores, model/mode actions) or not a DSH concept. Agent-to-agent relay
    // messages are folded by the adapter's subagent projection straight from
    // the durable session events, so the translator emits none.
    case 'agent.message':
    case 'session.ready':
    case 'session.reset':
    case 'tool.progress':
    case 'permission.request':
    case 'permission.settled':
    case 'question.request':
    case 'question.settled':
    case 'subagent.start':
    case 'subagent.progress':
    case 'subagent.end':
    case 'task.update':
    case 'task.end':
    case 'tasks.snapshot':
    case 'usage':
    case 'context.usage':
    case 'model.changed':
    case 'effort.changed':
    case 'mode.changed':
    case 'commands.changed':
    case 'notice':
    case 'rate-limit':
      return false
    default: {
      // Exhaustiveness: a new AgentEvent variant must be classified above.
      const unhandled: never = type
      return unhandled
    }
  }
}

/** Bind native log compatibility, attachments and tool presenters. */
export function createDshTranslator(deps: DshTranslatorDeps): NativeTranslator<SessionEvent, AssistantStreamFrame, SessionEvent<'tool/result'>['data']> {
  return createNativeTranslator<SessionEvent, AssistantStreamFrame, ContentBlock,
    Parameters<typeof isCompactionCheckpointSource>[0], Parameters<typeof toolResultPayload>[0],
    SessionEvent<'tool/result'>['data']>({
    ...deps,
    BACKGROUND_START_ACK, isSubagentToolName, parseJobOutputId, todoPanelItems, toolCommandOf,
    harnessToolResultView, prepareReplayEvents, toolErrorText, isCompactionCheckpointSource,
    toolResultPayload, transcriptImagesOf,
  })
}

export type DshTranslator = ReturnType<typeof createDshTranslator>
