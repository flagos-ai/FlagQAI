import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { AgentEvent } from '../../agent/events.js'
import type { JobsRuntime } from '../jobs.js'
import { subscribeNativeToolOutput } from '#flagqai/harness-adapter/tool-output'

/** Bind native dispatch and owner-scoped jobs to the shared output observer. */
export function subscribeDshToolOutput(ctx: Context, agent: Agent, publish: (events: readonly AgentEvent[]) => void): () => void {
  return subscribeNativeToolOutput<Agent, ToolExecutionResult>({
    jobs: ctx.get('jobs') as JobsRuntime | undefined,
    agent,
    publish,
    onExecute: listener => ctx.on('tools/execute', (exec: ToolDispatchExecution, next) => listener(exec, next)),
  })
}
