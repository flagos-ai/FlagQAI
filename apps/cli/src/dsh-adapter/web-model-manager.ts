import { createWebControls } from './web-controls.js'
import { randomUUID } from 'node:crypto'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { AgentSession } from '../agent/session.js'
import { recordedModelRoute } from '../modelRoute.js'
import { writeModelPref } from '../modelPrefs.js'
import { reserveNewSession, releaseMount } from '../sessionMounts.js'
import { sliceLiveSessionSeed } from './compat/index.js'
import { composePreset, runningPresetOf } from './presets.js'
import { createDshSession, dshHandleOf } from './backend/session.js'
import { modelSessionOptions, recordModelSelection } from './model-session.js'
import { attachSessionToWorkspace } from './workspace.js'
import type { HeadlessSessionInteractions } from './headless-interactions.js'

/** Native bindings for the shared model service; Harness retains fork semantics. */
export async function createWebModelManager(ctx: Context, interactions: (agent: ReturnType<typeof dshHandleOf>['agent']) => HeadlessSessionInteractions) {
  const modulePath = '../../flagqai-platform/harness-adapter/model-manager.mjs'
  const { createModelManager } = await import(modulePath) as typeof import('../../../../packages/harness-adapter/model-manager.mjs')
  const llm = ctx.get('llm') as {
    listProviders(): readonly { id: string; name: string }[]
    listModels(provider: string): Promise<readonly { id: string; name?: string }[]>
  }
  const prepare = async (session: AgentSession) => {
    const source = dshHandleOf(session).agent.session
    const seed = sliceLiveSessionSeed(source)
    const composed = await composePreset(ctx, runningPresetOf(source))
    return { source, seed, composed }
  }
  return createModelManager<AgentSession, AgentHandle, Awaited<ReturnType<typeof prepare>>>({
    commitRoute: session => session.capabilities.native?.dsh?.modelRoute,
    currentRoute: session => session.capabilities.native?.dsh?.modelRoute ?? recordedModelRoute(session.capabilities.native?.dsh?.rawHistory() ?? []),
    selectModel: writeModelPref,
    releaseMount,
    listProviders: () => llm.listProviders(),
    listModels: provider => llm.listModels(provider),
    prepare,
    newSessionId: randomUUID,
    reserve: async id => (await reserveNewSession(id)).reservation,
    create: (session, id, { source, seed, composed }, route) => ctx.agents.create(modelSessionOptions({
      sessionId: SessionId(id), source, seed, cwd: session.cwd,
      provider: route.provider, model: route.model, agentPreset: composed.agentPreset, setup: composed.setup,
    })),
    recordSelection: (handle, route) => recordModelSelection(handle.agent.session, route.provider, route.model),
    wrap: async (handle, route) => createDshSession(ctx, handle, {
      interactions: interactions(handle.agent), route,
      controls: await createWebControls(ctx, handle.agent, route),
    }),
    attach: async (session, id) => { await attachSessionToWorkspace(ctx, session.cwd, SessionId(id)) },
    reportCleanupError: error => ctx.logger.warn(`FlagQAI: model switch cleanup failed (${String(error)})`),
  })
}
