import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionCapabilities } from '../../agent/capabilities.js'
import type { ModelRoute } from '../../modelRoute.js'
import { releaseMount, reserveNewSession } from '../../sessionMounts.js'
import { appendInterruptedTurnEnd, liveSessionCreateOptions, sliceLiveSessionSeed, snapshotLiveSessionEvents, userTitleData } from '../compat/index.js'
import { closeLiveForkTurn } from '../compat/liveSession.js'
import { recordModelSelection } from '../model-session.js'
import { composePreset, runningPresetOf } from '../presets.js'
import { forkTarget } from '../sessionTree.js'
import { attachSessionToWorkspace } from '../workspace.js'

import { createNativeSessionActions } from '#flagqai/harness-adapter/session-actions'

/** Native creation, preset, log and mount bindings for shared coordination. */
export function createDshSessionActions(ctx: Context, agent: Agent, route?: ModelRoute): Pick<SessionCapabilities, 'rename' | 'fork'> {
  return createNativeSessionActions<ReturnType<typeof SessionId>, Agent['session'], SessionEvent, Awaited<ReturnType<typeof composePreset>>>({
    agent,
    appendTitle: (session, title) => { session.append('session/title', userTitleData(title)) },
    ...(route === undefined ? {} : { fork: {
      snapshot: () => snapshotLiveSessionEvents(agent.session),
      seed: () => sliceLiveSessionSeed(agent.session),
      target: forkTarget,
      appendInterruptedTurnEnd,
      compose: () => composePreset(ctx, runningPresetOf(agent.session), true),
      createId: () => SessionId(randomUUID()),
      reserve: reserveNewSession,
      async create(input) {
        return ctx.agents.create(liveSessionCreateOptions({
          sessionId: input.sessionId, seed: input.seed, inheritedCount: input.inheritedCount,
          runtimeSession: input.runtimeSession, cwd: input.cwd, parentSession: input.parentSession,
          agentPreset: input.composed.agentPreset, agentOptions: route,
          setup: async (childCtx, child) => {
            if (input.closeTurn !== undefined) closeLiveForkTurn(child.session, input.closeTurn)
            await input.composed.setup?.(childCtx, child)
          },
        }))
      },
      recordModelSelection: session => recordModelSelection(session, route.provider, route.model),
      attach: (cwd, id) => attachSessionToWorkspace(ctx, cwd, id),
      release: releaseMount,
    } }),
  })
}
