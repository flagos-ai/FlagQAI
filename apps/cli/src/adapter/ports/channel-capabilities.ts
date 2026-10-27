/**
 * Facts presented by one live agent to the CLI. This port contains no
 * service lookup: the channel resolver supplies the evidence at runtime.
 */

export type CommandRoute = 'local' | 'registry' | 'none'

/** Translation keys for commands that have no executable route. */
export type CapabilityReasonKey =
  | 'capability-reason-no-compaction'
  | 'capability-reason-no-plan-command'

/** A missing command must carry an explanation for Help and completion. */
export type CommandCapability =
  | Readonly<{ route: 'local' }>
  | Readonly<{ route: 'registry' }>
  | Readonly<{ route: 'none'; reasonKey: CapabilityReasonKey }>

export interface AgentCapabilities {
  /** Compact prefers the local transaction and can use the command registry. */
  readonly compact: CommandCapability
  /** Plan is served by a registered command when available. */
  readonly plan: CommandCapability
  /** A compaction service is mounted in the agent's actual scope. */
  readonly compaction: boolean
  /** Tool-result pruning is available in that scope. */
  readonly pruner: boolean
  /** The agent can reach the interactive question tool. */
  readonly questionTool: boolean
  /** A skill registry is available to this agent. */
  readonly skills: boolean
}
