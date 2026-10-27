/** Bind native brands, interrupted event construction and append/create APIs. */
import * as dshSession from '@deepseek-ai/dsh-session'
import type { CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { createLiveSessionCompatibility } from '#flagqai/harness-adapter/live-session'
export type { LiveSessionSeedMetadata } from '#flagqai/harness-adapter/live-session'

function brandCtor(name: 'SessionSeq' | 'SessionLogOffset'): ((value: number) => number) | undefined {
  const ctor = (dshSession as Record<string, unknown>)[name]
  return typeof ctor === 'function' ? ctor as (value: number) => number : undefined
}

function brandSessionSeq(value: number): number {
  return brandCtor('SessionSeq')?.(value) ?? value
}

function brandSessionLogOffset(value: number): number {
  return brandCtor('SessionLogOffset')?.(value) ?? value
}

const compatibility = createLiveSessionCompatibility<SessionEvent>({
  brandSessionLogOffset,
  makeInterruptedTurnEnd: (seq, time, turn) => ({
    type: 'turn/end', seq: brandSessionSeq(seq), time,
    data: { turn, reason: { kind: 'aborted', reason: { kind: 'user' } } },
  } as SessionEvent),
})
export const { snapshotLiveSessionEvents, liveSessionOffset, liveSessionPhysicalSeedLength, liveSessionListingFields, sliceLiveSessionSeed, liveSessionSeedMetadata, appendInterruptedTurnEnd } = compatibility

/** Close a V3 fork's open inherited turn as child-owned events, after its marker. */
export function closeLiveForkTurn(session: Session, turn: number): void {
  for (const event of dshSession.interruptedTurnClosers(snapshotLiveSessionEvents(session))) {
    switch (event.type) {
      case 'tool/result':
        session.append('tool/result', event.data, {
          surfaceOp: event.surfaceOp,
          ...(event.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: event.sourceEventSeqs }),
        })
        break
      case 'step/end':
        session.append('step/end', event.data)
        break
      case 'turn/end':
        if (event.data.turn !== turn) throw new Error('fork turn closure does not match its selected turn')
        session.append('turn/end', { turn, reason: { kind: 'aborted', reason: { kind: 'user' } } })
        break
      default:
        throw new Error(`unsupported fork closure event: ${event.type}`)
    }
  }
}

export interface LiveSessionCreateRequest {
  readonly sessionId: SessionId
  readonly seed: readonly SessionEvent[]
  /** Live Session whose shape identifies the active upstream runtime line. */
  readonly runtimeSession: unknown
  readonly inheritedCount: number
  readonly cwd: string
  readonly parentSession?: SessionId
  readonly agentPreset?: string
  readonly agentOptions: CreateAgentOptions['agentOptions']
  readonly setup?: CreateAgentOptions['setup']
}

/**
 * Dual-runtime seed metadata for `agents.create`. The only
 * CreateAgentOptions assertion lives here: rc.2 meta carries `seedLength`,
 * alpha.4 carries `isSeeded` plus top-level `inheritedEventCount`.
 */
export function liveSessionCreateOptions(request: LiveSessionCreateRequest): CreateAgentOptions {
  const seedMetadata = liveSessionSeedMetadata(request.runtimeSession, request.inheritedCount)
  return {
    sessionId: request.sessionId,
    seed: request.seed,
    meta: {
      cwd: request.cwd,
      ...(request.parentSession === undefined ? {} : { parentSession: request.parentSession }),
      ...seedMetadata.meta,
      ...(request.agentPreset === undefined ? {} : { agentPreset: request.agentPreset }),
    },
    ...(seedMetadata.inheritedEventCount === undefined
      ? {}
      : { inheritedEventCount: seedMetadata.inheritedEventCount }),
    agentOptions: request.agentOptions,
    ...(request.setup === undefined ? {} : { setup: request.setup }),
  } as CreateAgentOptions
}
