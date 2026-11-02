/** Session-scoped workbench tools. The native Harness still owns execution. */
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { experimentEvidence, runEvidence, runSettled } from './workbench-evidence.js'

type Binding = { port: number; client: string; session: string }
const sameBinding = (a: Binding | undefined, b: Binding | undefined) => a?.port === b?.port && a?.client === b?.client && a?.session === b?.session
const identifier = /^[a-zA-Z0-9-]{1,128}$/

export function workbenchBinding(text: string, session: string): Binding | undefined {
  const marker = '\n\n<workspace_controls>\n'
  const at = text.lastIndexOf(marker)
  if (at < 0 || !text.endsWith('\n</workspace_controls>')) return
  try {
    const value = JSON.parse(text.slice(at + marker.length, -'\n</workspace_controls>'.length))
    const command = value.command
    if (value.schema !== 'flagqai.workspace-controls.v1' || !Array.isArray(command) ||
      command.length !== 8 || command[0] !== 'python3' || typeof command[1] !== 'string' ||
      !(command[1] === 'packages/quantum-workspace/workbench.py' || command[1].replaceAll('\\', '/').endsWith('/packages/quantum-workspace/workbench.py')) ||
      command[2] !== '--port' || command[4] !== '--client' || command[6] !== '--session' ||
      command[7] !== session || typeof command[5] !== 'string' || !identifier.test(command[5])) return
    if (typeof command[3] !== 'string' || !/^[0-9]{1,5}$/.test(command[3])) return
    const port = Number(command[3])
    if (!Number.isInteger(port) || port < 1 || port > 65535) return
    return { port, client: command[5], session }
  } catch { return }
}

const string = { type: 'string', minLength: 1 } as const
const schema = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object', additionalProperties: false, properties, required,
})
type Input = Record<string, string>

export function createWorkbenchTools(
  binding: () => Binding | undefined,
  cwd: string,
  request: typeof fetch = fetch,
): ToolDefinition[] {
  async function action(operation: string, args: Record<string, unknown>, signal: AbortSignal, target = binding()) {
    signal.throwIfAborted()
    if (!target) throw new Error('Open the Web workbench and send this task from its Agent panel.')
    const base = `http://127.0.0.1:${target.port}`
    const options = { signal, redirect: 'error' as const }
    const configResponse = await request(base + '/api/agent', options)
    if (!configResponse.ok) throw new Error('Workbench configuration is unavailable.')
    const config = await configResponse.json() as { cwd?: string }
    if (typeof config.cwd !== 'string' || resolve(config.cwd) !== resolve(cwd))
      throw new Error('The workbench belongs to a different native workspace.')
    if (!sameBinding(binding(), target)) throw new Error('Workbench context changed before this action. Inspect the active task first.')
    signal.throwIfAborted()
    const response = await request(base + '/api/workspace/actions', {
      ...options, method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...args, ...target, operation }),
    })
    const value = await response.json() as Record<string, unknown>
    if (!response.ok) throw new Error(String(value.error || 'Workbench action failed.'))
    return value
  }
  function tool(name: string, description: string, parameters: Record<string, unknown>,
    execute: (input: Input, signal: AbortSignal) => Promise<unknown>): ToolDefinition {
    return {
      name, description, parameters: parameters as ToolDefinition['parameters'],
      output: { schema: { type: 'object' }, render: (_input, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: (input, context) => execute(input as Input, context.signal),
    }
  }
  return [
    tool('workbench_inspect', 'Read authoritative workbench state, browser draft, shared model, Python run, saved experiment or project. Run/experiment evidence defaults to a compact projection with explicit truncation indicators. Use detail=full when more data is needed, instead of shell inspection, archive extraction or guessing file formats.',
      schema({ resource: { type: 'string', enum: ['workspace', 'draft', 'model', 'run', 'experiment', 'project'] }, id: string, detail: { type: 'string', enum: ['summary', 'full'] } }, ['resource']),
      async (input, signal) => {
        const operations: Record<string, [string, string]> = { workspace: ['status', ''], draft: ['draft.read', ''], model: ['model.read', 'model_id'], run: ['python.read', 'run_id'], experiment: ['experiment.read', 'experiment_id'], project: ['project.inspect', 'project_id'] }
        const [op, key] = operations[input.resource]
        if (key && !input.id) throw new Error('This resource requires an id.')
        const target = binding()
        const record = await action(op, key ? { [key]: input.id } : {}, signal, target)
        if (input.detail === 'full') return record
        if (input.resource === 'run') return runEvidence(record)
        if (input.resource === 'experiment') return experimentEvidence(record, target!.port)
        return record
      }),
    tool('workbench_create_python', 'Create a new Python model without replacing an unsaved browser draft. Write ordinary FlagQuantum code with fq.save("name.fqx", result.plan, result=result). Returns file.id and file.revision. Keep names and source specific to the task.',
      schema({ source: { ...string, maxLength: 32768 }, name: { ...string, maxLength: 200 }, request_id: string }, ['source', 'name', 'request_id']),
      (input, signal) => action('model.create', { ...input, language: 'python' }, signal)),
    tool('workbench_run_python', 'Run the exact shared Python model revision using the managed SDK environment. Do not run an unrelated local interpreter or manually simulate. Returns python_run.id; use workbench_wait_run to await execution and collection. Reuse request_id for retries of identical input.',
      schema({ model_id: string, revision: string, request_id: string }, ['model_id', 'revision', 'request_id']),
      async (input, signal) => {
        const result = await action('python.run', { model_id: input.model_id, expected_revision: input.revision, request_id: input.request_id }, signal)
        return { python_run: runEvidence(result.python_run as Record<string, unknown>), next_tool: 'workbench_wait_run' }
      }),
    tool('workbench_wait_run', 'Wait briefly for an existing Python run and artifact collection to settle. Read-only: never submits or reruns code. Use this instead of shell sleep or rapid repeated model calls. Returns on terminal collection, cancellation, context change, or the bounded deadline; a deadline does not stop the Python run.',
      schema({ run_id: string, timeout_ms: { type: 'integer', minimum: 1, maximum: 10000 } }, ['run_id']),
      async (input, signal) => {
        const timeout = input.timeout_ms === undefined ? 5000 : Number(input.timeout_ms)
        if (!Number.isInteger(timeout) || timeout < 1 || timeout > 10000) throw new Error('timeout_ms must be between 1 and 10000.')
        const target = binding(), deadline = Date.now() + timeout
        const deadlineSignal = AbortSignal.timeout(timeout)
        const waiting = AbortSignal.any([signal, deadlineSignal])
        let last: Record<string, unknown> | undefined
        try {
          while (true) {
            signal.throwIfAborted()
            if (!sameBinding(binding(), target)) throw new Error('Workbench context changed while waiting; inspect the active task before continuing.')
            last = await action('python.read', { run_id: input.run_id }, waiting, target)
            if (!sameBinding(binding(), target)) throw new Error('Workbench context changed while waiting; inspect the active task before continuing.')
            if (runSettled(last)) return { ...runEvidence(last), wait_outcome: 'settled' }
            if (Date.now() >= deadline) break
            await delay(Math.min(500, Math.max(1, deadline - Date.now())), undefined, { signal: waiting })
          }
        } catch (error) {
          signal.throwIfAborted()
          if (!deadlineSignal.aborted) throw error
        }
        if (!last) throw new Error('No run status was received before the waiting deadline. The run was not resubmitted or cancelled.')
        return { ...runEvidence(last), wait_outcome: 'deadline' }
      }),
    tool('workbench_present_experiment', 'Verify a saved .fqx experiment and open its actual circuit or recorded result. Call after collection completes, before claiming completion. For tasks requesting both, present circuit and then result. Follow Agent controls navigation; drafts are preserved.',
      schema({ experiment_id: string, view: { type: 'string', enum: ['circuit', 'result'] }, request_id: string }, ['experiment_id', 'view', 'request_id']),
      async (input, signal) => {
        const target = binding()
        const record = await action('experiment.read', { experiment_id: input.experiment_id }, signal, target)
        if (record.id !== input.experiment_id || !record.program || (record.program as { id?: unknown }).id !== input.experiment_id)
          throw new Error('Saved experiment identity does not match the requested artifact.')
        if (input.view === 'result' && !record.job) throw new Error('This experiment has no saved result.')
        const focus = await action('focus', { page: input.view === 'circuit' ? 'program' : 'jobs', program_id: input.experiment_id, ...(input.view === 'result' ? { job_id: input.experiment_id } : {}), request_id: input.request_id }, signal, target)
        return { ...focus, evidence: experimentEvidence(record, target!.port) }
      }),
    tool('workbench_compare_experiments', 'Verify two saved experiments with recorded measurements and display their side-by-side comparison. Preserve each original source and result. Call before claiming that a comparison is displayed.',
      schema({ baseline_id: string, variant_id: string, request_id: string }, ['baseline_id', 'variant_id', 'request_id']),
      (input, signal) => action('experiment.compare', input, signal)),
  ]
}
