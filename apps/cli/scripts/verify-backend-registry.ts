/** Agent backend registry and Harness adapter contract.
 * Run: node --import tsx/esm scripts/verify-backend-registry.ts
 */
import assert from 'node:assert/strict'
import type { AgentBackend, BackendHost, OpenTarget } from '../src/agent/backend.js'
import { createAgentBackendRegistry } from '../src/agent/registry.js'
import type { AgentSession } from '../src/agent/session.js'
import { createDshBackend } from '../src/dsh-adapter/backend/backend.js'

const host: BackendHost = {
  cwd: '/workspace',
  debug: () => undefined,
  warn: () => undefined,
}

const session = (backendId: string, target: OpenTarget): AgentSession => ({
  ref: {
    backendId,
    sessionId: target.kind === 'resume' ? target.sessionId : 'new-session',
  },
  cwd: target.kind === 'create' ? target.cwd : host.cwd,
  status: 'idle',
  capabilities: {},
  history: async () => [],
  subscribe: () => () => undefined,
  submit: async () => ({ accepted: true }),
  cancel: async () => ({ stillQueued: [], outcome: 'confirmed' }),
  dispose: async () => undefined,
})

let optionalLoads = 0
const optional: AgentBackend = {
  id: 'optional',
  descriptor: { label: 'Optional' },
  detect: async () => ({ installed: true, version: '1.0.0' }),
  open: async target => session('optional', target),
}
const opened: OpenTarget[] = []
const dsh = createDshBackend(async target => {
  opened.push(target)
  return session('dsh', target)
})
const registry = createAgentBackendRegistry([
  { id: 'dsh', load: async () => dsh },
  { id: 'optional', load: async () => { optionalLoads += 1; return optional } },
])

assert.deepEqual(registry.ids, ['dsh', 'optional'])
assert.deepEqual(await registry.detect('dsh', host), { installed: true, auth: 'unknown' })
assert.equal((await dsh.open({ kind: 'create', cwd: '/repo' }, host)).cwd, '/repo')
assert.deepEqual(opened, [{ kind: 'create', cwd: '/repo' }])
console.log('PASS Harness uses the common backend contract')

const [first, second] = await Promise.all([registry.load('optional'), registry.load('optional')])
assert.equal(first, optional)
assert.equal(second, optional)
assert.equal(optionalLoads, 1)
assert.equal((await registry.detect('optional', host)).version, '1.0.0')
assert.equal(optionalLoads, 1)
console.log('PASS lazy backend loads are shared and cached')

await assert.rejects(Promise.resolve().then(() => registry.load('missing')), /Unknown agent backend "missing"/)
assert.throws(
  () => createAgentBackendRegistry([{ id: 'dsh', load: async () => dsh }, { id: 'dsh', load: async () => dsh }]),
  /registered more than once/,
)
await assert.rejects(
  createAgentBackendRegistry([{ id: 'expected', load: async () => optional }]).load('expected'),
  /registration "expected" loaded backend "optional"/,
)
console.log('PASS invalid backend registrations fail closed')

let attempts = 0
const retrying = createAgentBackendRegistry([{
  id: 'optional',
  load: async () => {
    attempts += 1
    if (attempts === 1) throw new Error('not installed')
    return optional
  },
}])
await assert.rejects(retrying.load('optional'), /not installed/)
assert.equal(await retrying.load('optional'), optional)
assert.equal(attempts, 2)
console.log('PASS failed optional backend loads can be retried')

console.log('ALL PASS backend registry')
