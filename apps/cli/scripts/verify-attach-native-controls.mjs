import assert from 'node:assert/strict'

import { handleNativeControlCommand } from '../bin/attach.js'

const calls = []
const output = []
let busy = false
const controls = {
  plan: { available: true, active: false, pending: null },
  mode: { available: true, current: 'normal', options: [{ id: 'normal', label: 'Normal' }, { id: 'plan', label: 'Plan' }] },
  effort: { available: true, current: null, options: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }] },
}
const client = {
  async getSessionControls(id) { assert.equal(id, 'resource-1'); return controls },
  async setSessionPlan(id, input) {
    calls.push(['plan', id, input])
    if (busy) throw Object.assign(new Error('Finish current turn'), { code: 'session_busy' })
    controls.plan.active = input.active
    return controls
  },
  async setSessionControl(id, input) {
    calls.push(['control', id, input])
    controls[input.kind].current = input.id
    return controls
  },
}
const run = line => handleNativeControlCommand(line, {
  client, sessionId: 'resource-1', write: text => output.push(text), warn: text => output.push(text),
})

assert.equal(await run('/unknown'), false)
assert.equal(await run('/mode'), true)
assert.match(output.join(''), /2\. "Plan"/)
assert.equal(await run('/mode 3'), true)
assert.equal(calls.length, 0, 'invalid choices must not change Harness state')
await run('/mode 2')
await run('/effort 2')
await run('/effort auto')
await run('/plan on')
assert.deepEqual(calls, [
  ['control', 'resource-1', { kind: 'mode', id: 'plan' }],
  ['control', 'resource-1', { kind: 'effort', id: 'high' }],
  ['control', 'resource-1', { kind: 'effort', id: null }],
  ['plan', 'resource-1', { active: true }],
])
busy = true
await run('/plan off')
assert.match(output.join(''), /session_busy.*Current session retained/)
controls.mode.available = false
await run('/mode')
assert.match(output.join(''), /mode is unavailable/)
console.log('PASS attach native controls: live choices, confirmed changes, unavailable and busy states')
