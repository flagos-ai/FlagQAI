import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentSetup } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { explicitModelRoute, recordedModelRoute, validateModelRoute, type ModelRoute } from '../modelRoute.js'
import { migratePresetPref, readPresetPref } from '../presetPrefs.js'
import { reserveMount } from '../sessionMounts.js'
import { ensureLegacySessionEventTypes, snapshotLiveSessionEvents } from './compat/index.js'
import { composePreset, resolvePersistedPreset, resolvePersistedRoute, runningPresetOf } from './presets.js'
import type { createAgentResolver as SharedResolverFactory } from '../../../../packages/harness-adapter/agent-resolution.mjs'

/**
 * Create or resume a Harness agent using the same route, preset, persistence,
 * and mount-safety rules for every FlagQAI client surface.
 */
export async function resolveAgent(
  ctx: Context,
  requestedSessionId: string | undefined,
  configuredRoute: { provider?: string; model?: string },
  startupRoute: ModelRoute,
  meta: { cwd: string },
  configuredPreset?: string,
): Promise<{ agent: Agent; handle?: AgentHandle; agentPreset?: string; route?: ModelRoute }> {
  const modulePath = '../../flagqai-platform/harness-adapter/agent-resolution.mjs'
  const { createAgentResolver } = await import(modulePath) as { createAgentResolver: typeof SharedResolverFactory }
  const resolve = createAgentResolver<Agent, AgentHandle, AgentSetup>({
    explicitRoute: explicitModelRoute,
    existing: id => ctx.agents.get(SessionId(id)),
    runningPreset: agent => runningPresetOf(agent.session),
    reserveMount,
    prepareResume: ensureLegacySessionEventTypes,
    persistedPreset: id => resolvePersistedPreset(ctx, SessionId(id)),
    composePreset: id => composePreset(ctx, id, true),
    persistedRoute: id => resolvePersistedRoute(ctx, SessionId(id)),
    resume: (id, route, setup) => ctx.agents.resume({
      resumeSessionId: SessionId(id), agentOptions: route,
      ...(setup === undefined ? {} : { setup }),
    }),
    disposeHandle: handle => handle.dispose(),
    reportCleanupError: error => ctx.logger.error(error),
    recordedRoute: agent => recordedModelRoute(snapshotLiveSessionEvents(agent.session)),
    nextSessionId: randomUUID,
    readPresetPref,
    migratePresetPref,
    validateRoute: route => validateModelRoute(ctx.get('llm') as
      { listModels(provider: string): Promise<readonly { id: string }[]> } | undefined, route),
    warn: message => ctx.logger.warn(message),
    create: input => ctx.agents.create({
      sessionId: SessionId(input.sessionId), meta: input.meta, agentOptions: input.route,
      ...(input.setup === undefined ? {} : { setup: input.setup }),
    }),
  })
  return resolve({ requestedSessionId, configuredRoute, startupRoute, meta, configuredPreset })
}
