import { recognizedQuantumCalculation } from './quantum-capability.js'

export { recognizedQuantumCalculation } from './quantum-capability.js'

const CLI_COMMANDS = new Set(['science', 'quantum', 'desktop', 'web', 'setup', 'doctor',
  'attach', 'serve', 'safe', 'update', 'migrate', 'help', 'version', 'run'])

/** Default native sessions mount the quantum-augmented Standard preset. Keep
 * utility commands, flag-shaped invocations and explicit preset choices out
 * of this path; a resumed session retains its own recorded preset. */
export function defaultQuantumSession(args, env = process.env) {
  if (env.FLAGQAI_PRESET && env.FLAGQAI_PRESET !== 'flagquantum') return false
  if (env.FLAGQAI_BACKEND && env.FLAGQAI_BACKEND !== 'dsh') return false
  if (env.FLAGQAI_ENABLE_FLAGQUANTUM_MCP === '0') return false
  if (!Array.isArray(args)) return false
  if (args.length === 0) return true
  const promptArgs = args[0] === '--' ? args.slice(1) : args
  if (promptArgs.length === 0 || promptArgs.some(arg => typeof arg !== 'string' || arg.startsWith('-'))) return false
  return args[0] === '--' || !CLI_COMMANDS.has(promptArgs[0])
}

/** A positional calculation also gets a task-specific preflight before the
 * first model request. Never override a caller-selected preset or MCP opt-out. */
export function automaticQuantumTask(args, env = process.env) {
  if (env.FLAGQAI_PRESET && env.FLAGQAI_PRESET !== 'flagquantum') return null
  if (env.FLAGQAI_BACKEND && env.FLAGQAI_BACKEND !== 'dsh') return null
  if (env.FLAGQAI_ENABLE_FLAGQUANTUM_MCP === '0') return null
  if (!Array.isArray(args) || args.length === 0) return null
  const promptArgs = args[0] === '--' ? args.slice(1) : args
  if (promptArgs.length === 0 || promptArgs.some(arg => typeof arg !== 'string' || arg.startsWith('-'))) return null
  if (args[0] !== '--' && CLI_COMMANDS.has(promptArgs[0])) return null
  const task = promptArgs.join(' ').trim()
  if (!task) return null
  return recognizedQuantumCalculation(task) ? task : null
}
