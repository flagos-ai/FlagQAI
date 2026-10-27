import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandRuntime } from '@deepseek-ai/dsh-commands'
import type { SessionCapabilities } from '../agent/capabilities.js'
import { DEFAULT_SESSION_MODES } from '../sessionModes.js'
import { adapterRuntimeFor } from '../adapter/kernel/runtime-context.js'
import { assertCapabilityShadowPolicy } from '../adapter/kernel/runtime.js'
import { createPermissionModeActions } from './channel/mode-permission-actions.js'
import { createPermissionModeRoster } from './channel/mode-roster.js'
import { serviceForAgent } from './presets.js'

/** Same mode composition and observed-exit restoration as the terminal.
 * The Harness command, plan state, review question and policies keep ownership. */
export function createWebPlan(ctx: Context, agent: Agent) {
  const plan = serviceForAgent<{ get(agent: Agent): { active: boolean; pending?: boolean } }>(ctx, agent, 'planMode')
  const commands = ctx.get('commands') as CommandRuntime | undefined
  if (typeof plan?.get !== 'function' || typeof commands?.execute !== 'function' || !commands.find(agent, 'plan')) {
    return { capability: undefined, dispose() {} }
  }
  const runtime = adapterRuntimeFor(ctx)
  const abort = new AbortController()
  let disposed = false
  const state = { mode: DEFAULT_SESSION_MODES[0]!, modeIndex: 0, emit() {} }
  const roster = createPermissionModeRoster(ctx, { configuredModes: DEFAULT_SESSION_MODES, agent: () => agent })
  const actions = createPermissionModeActions(ctx, state, {
    owner: { current: () => !disposed }, runtime,
    binding: { agent, capture: () => ({ agent }), isCurrent: capture => !disposed && capture.agent === agent },
    sessionModes: roster.modes, roster, commandService: commands,
    async executeRegistryCommand(name, input) {
      assertCapabilityShadowPolicy('host.commands.invoke', runtime.mode, runtime.slices)
      const result = await commands.execute(agent, `/${name}${input}`, [], abort.signal)
      if (result === undefined) throw new Error('Native plan command is unavailable')
      if (result.result.kind !== 'success') throw new Error(result.result.text)
      return result.result.text ?? ''
    },
    notify(message, options) { if (options?.color === 'error' || options?.color === 'warning') ctx.logger.warn(message); return () => {} },
  })
  const unsubscribe = ctx.on('session/event', (session, event) => {
    if (!disposed && session === agent.session) actions.onSessionEvent(session, event)
  })
  const capability: NonNullable<SessionCapabilities['plan']> = {
    current: () => plan.get(agent),
    async set(active) {
      if (disposed || agent.status === 'running') throw new Error('Plan mode is unavailable while the session is busy')
      await actions.applyModeChecked(DEFAULT_SESSION_MODES.find(mode => mode.id === (active ? 'plan' : 'default'))!)
    },
  }
  return { capability, dispose() { disposed = true; abort.abort(); unsubscribe() } }
}
