import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandRuntime } from '@deepseek-ai/dsh-commands'
import type { AgentCapabilities, CommandCapability } from '../../adapter/ports/channel-capabilities.js'
import type { LocalCommand } from '../../commands.js'
import { presetHidesHostAskTool, runningPresetOf, serviceForAgent } from '../presets.js'

/** Live facts for one bound agent; the resolver does not consult preset names. */
export interface CapabilityEvidence {
  readonly agent: Agent | undefined
  readonly commandService: CommandRuntime | undefined
  readonly service: (key: string) => unknown
  readonly toolPresent: (name: string) => boolean
  readonly presetId: string | undefined
}

function registered(evidence: CapabilityEvidence, name: string): boolean {
  if (evidence.agent === undefined || evidence.commandService === undefined) return false
  try {
    return evidence.commandService.find(evidence.agent, name) !== undefined
  } catch {
    return false
  }
}

/** Resolve routes from this agent's mounted services and command registry. */
export function resolveAgentCapabilities(evidence: CapabilityEvidence): AgentCapabilities {
  const compaction = evidence.service('compaction') as { compactNow?: unknown } | undefined
  const localCompact = typeof compaction?.compactNow === 'function'
  const compact: CommandCapability = localCompact
    ? { route: 'local' }
    : registered(evidence, 'compact')
      ? { route: 'registry' }
      : { route: 'none', reasonKey: 'capability-reason-no-compaction' }
  const plan: CommandCapability = registered(evidence, 'plan')
    ? { route: 'registry' }
    : { route: 'none', reasonKey: 'capability-reason-no-plan-command' }
  return {
    compact,
    plan,
    compaction: localCompact,
    pruner: evidence.service('toolResultPruner') !== undefined,
    questionTool: !presetHidesHostAskTool(evidence.presetId) && evidence.toolPresent('ask_user_question'),
    skills: evidence.service('skills') !== undefined,
  }
}

/** Capture the host facilities that the current agent actually sees. */
export function agentCapabilityEvidence(ctx: Context, agent: Agent | undefined): CapabilityEvidence {
  const commandService = ctx.get('commands') as CommandRuntime | undefined
  const tools = ctx.get('tools') as { get(name: string, scope?: unknown): unknown } | undefined
  return {
    agent,
    commandService,
    service: key => agent === undefined ? ctx.get(key) : serviceForAgent(ctx, agent, key),
    toolPresent: name => agent !== undefined && tools?.get(name, agent) !== undefined,
    presetId: agent === undefined ? undefined : runningPresetOf(agent.session),
  }
}

/** Keep an unavailable local command visible, with an honest Help description. */
export function annotateCommandCapabilities(
  commands: readonly LocalCommand[],
  capabilities: AgentCapabilities,
): LocalCommand[] {
  if (capabilities.compact.route !== 'none') return commands as LocalCommand[]
  let changed = false
  const annotated = commands.map(command => {
    if (command.name !== 'compact') return command
    changed = true
    return { ...command, descriptionKey: 'cmd-desc-compact-unavailable' as const }
  })
  return changed ? annotated : commands as LocalCommand[]
}
