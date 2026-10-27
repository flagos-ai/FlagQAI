import assert from 'node:assert/strict'
import { guardFlagQuantumInput } from '../src/dsh-adapter/quantum-input-guard.js'

const calls: Array<{ task?: string; cwd?: string }> = []
const probe = async (options: { task?: string; cwd?: string }): Promise<unknown> => {
  calls.push(options)
  return { status: 'ready' }
}
const molecularTask = '计算 H2 基态能量，用 VQE'

assert.equal(await guardFlagQuantumInput('standard', molecularTask, '/workspace', probe), false)
assert.equal(await guardFlagQuantumInput('flagquantum', 'Simulate a Bell circuit', '/workspace', probe), false)
assert.equal(await guardFlagQuantumInput('flagquantum', 'Review the README', '/workspace', probe), false)
assert.deepEqual(calls, [], 'ordinary tasks and other presets never start a research probe')

await assert.rejects(
  guardFlagQuantumInput('flagquantum', 'Calculate the Hamiltonian spectrum', '/workspace', probe),
  error => (error as { code?: string }).code === 'unsupported_quantum_task'
    && /no model request was sent/u.test((error as Error).message),
)
assert.deepEqual(calls, [], 'unsupported calculations never probe or reach the native delivery path')

assert.equal(await guardFlagQuantumInput('flagquantum', molecularTask, '/workspace', probe), true)
assert.deepEqual(calls, [{ task: molecularTask, cwd: '/workspace' }])

const blocked = Object.assign(new Error('FlagQuantum MCP lacks required task tools'), { code: 'required_tool_missing' })
await assert.rejects(guardFlagQuantumInput('flagquantum', molecularTask, '/workspace', async () => { throw blocked }),
  error => error === blocked)

console.log('PASS later molecular input is preflighted, unsupported calculations fail before delivery, and ordinary inputs remain unchanged')
