import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('scripted MCP answers zero and string request IDs while ignoring notifications', () => {
  const messages = [
    { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 'tools', method: 'tools/list' },
  ]
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./quantum-preflight-fixture.mjs', import.meta.url))], {
    input: messages.map(message => JSON.stringify(message) + '\n').join(''),
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, FQ_TEST_MODE: '' },
  })
  assert.equal(result.status, 0, result.stderr)
  const replies = result.stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(replies.map(reply => reply.id), [0, 'tools'])
  assert.ok(replies[0].result.capabilities.tools)
  assert.ok(replies[1].result.tools.some(tool => tool.name === 'train_parameters_tool'))
})
