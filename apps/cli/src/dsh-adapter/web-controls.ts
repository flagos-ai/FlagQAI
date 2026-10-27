import { createWebPlan } from './web-plan.js'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type Agent, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SessionCapabilities } from '../agent/capabilities.js'
import type { ModelRoute } from '../modelRoute.js'
import { STANDARD_EFFORT_LADDER } from '../effortPrefs.js'
import { serviceForAgent } from './presets.js'
import { snapshotLiveSessionEvents } from './compat/liveSession.js'
import { ensureLegacySessionEventTypes } from './compat/sessionLog.js'
import { permissionPresetRuntime, permissionPresetSnapshotFromService } from './channel/permissions.js'

/** Headless request controls use the Harness hook and permission registry.
 * The terminal installs its own selection hook; never install this there. */
export async function createWebControls(ctx: Context, agent: Agent, route: ModelRoute) {
  const llm = serviceForAgent<{ resolveModelInfo(provider: string, model: string): Promise<{ reasoning?: boolean | { efforts?: readonly { id: string; name: string }[] } }> }>(ctx, agent, 'llm')
  let levels: readonly { id: string; label: string }[] = []
  let available = false
  let fallback = false
  try {
    const reasoning = (await llm?.resolveModelInfo(route.provider, route.model))?.reasoning
    available = reasoning === true || typeof reasoning === 'object' && reasoning !== null
    fallback = reasoning === true || typeof reasoning === 'object' && reasoning !== null && reasoning.efforts === undefined
    levels = reasoning === true || typeof reasoning === 'object' && reasoning !== null && reasoning.efforts === undefined
      ? STANDARD_EFFORT_LADDER.map(id => ({ id, label: id }))
      : typeof reasoning === 'object' && reasoning !== null ? (reasoning.efforts ?? []).map(item => ({ id: item.id, label: item.name })) : []
  } catch { /* Unknown metadata must not advertise guessed controls. */ }
  const previous = agent.session.requestHeader()?.config
  let effort: string | undefined = agent.options.reasoningEffort ?? (previous?.provider === route.provider && previous?.model === route.model ? previous.reasoningEffort : undefined)
  for (const event of snapshotLiveSessionEvents(agent.session) as readonly { type: string; data: unknown }[]) {
    if (event.type !== 'flagqai/effort-selected') continue
    const data = event.data as { provider?: string; model?: string; effort?: unknown }
    if (data.provider === route.provider && data.model === route.model && (data.effort === null || typeof data.effort === 'string')) effort = data.effort ?? undefined
  }
  const selection: ModelSelectionRef = { current: { ...route, ...(effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(effort) }) }, assembled: undefined }
  const dispose = installModelSelection(agent.ctx, selection)
  const registry = permissionPresetRuntime(serviceForAgent(ctx, agent, 'permissionPresets'))
  const snapshot = () => permissionPresetSnapshotFromService(registry, agent.session)
  const plan = createWebPlan(ctx, agent)
  const capabilities: Pick<SessionCapabilities, 'effort' | 'modes' | 'plan'> = {
    ...(plan.capability === undefined ? {} : { plan: plan.capability }),
    ...(available && levels.length ? { effort: {
      ...(fallback ? { levelsFallback: true as const } : {}),
      levels: () => levels,
      current: () => effort,
      async set(id: string | null) {
        if (id !== null && !levels.some(level => level.id === id)) throw new Error('Unsupported reasoning effort')
        ensureLegacySessionEventTypes()
        ;(agent.session as unknown as { append(type: string, data: unknown): void }).append('flagqai/effort-selected', { ...route, effort: id })
        effort = id ?? undefined
        selection.current = { ...route, ...(effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(effort) }) }
      },
    } } : {}),
    ...(registry?.set && snapshot().availability === 'runtime' ? { modes: {
      list: () => snapshot().options.map(option => ({ id: option.value, label: option.name, description: option.description })),
      current: () => snapshot().current?.value ?? 'unknown',
      async set(id: string) {
        if (!snapshot().options.some(option => option.value === id)) throw new Error('Unsupported permission preset')
        await registry.set!(agent.session, id)
        if (snapshot().current?.value !== id) throw new Error('Permission preset readback did not confirm the change')
      },
    } } : {}),
  }
  return { capabilities, dispose() { plan.dispose(); dispose() } }
}
