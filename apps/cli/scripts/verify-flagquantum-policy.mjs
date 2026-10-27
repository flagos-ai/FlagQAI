import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { withFlagQuantumPolicy } from '../lib/types/dsh-adapter/flagquantum-policy.js'

const standard = { tools: [{ name: 'bash' }], sections: [] }
assert.equal(withFlagQuantumPolicy(standard, 'standard'), standard)
assert.throws(() => withFlagQuantumPolicy(standard, 'flagquantum'), /no mounted MCP tools/)
const mounted = { ...standard, tools: [...standard.tools, { name: 'mcp__flagquantum__simulate_circuit_tool' }] }
const guided = withFlagQuantumPolicy(mounted, 'flagquantum')
assert.equal(guided.sections.length, 1)
assert.match(guided.sections[0].text, /do not silently switch/i)
assert.equal(withFlagQuantumPolicy(guided, 'flagquantum'), guided)
const help = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/flagqai.js', import.meta.url)), 'quantum', '--help'], { encoding: 'utf8' })
assert.equal(help.status, 0, help.stderr)
assert.match(help.stdout, /flagqai quantum \[task\]/)
console.log('PASS FlagQuantum entry and fail-closed mounted-tool policy')
