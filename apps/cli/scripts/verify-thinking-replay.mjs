/** Local wire regression: unsigned DeepSeek thinking survives tools and durable replay. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { withProviderProtocolDefaults, createProviderManager } from '../../../packages/harness-adapter/provider-manager.mjs'
import { nativeDeepSeekHistory } from '../lib/types/dsh-adapter/compat/deepseekReplay.js'

// An explicit installed adapter permits the same offline check on the local service runtime.
const adapterUrl = process.env.FLAGQAI_REPLAY_ADAPTER_PATH
  ? pathToFileURL(process.env.FLAGQAI_REPLAY_ADAPTER_PATH).href
  : import.meta.resolve('@deepseek-ai/dsh-llm-pi-ai')
const { PiAiAdapter } = await import(adapterUrl)
const require = createRequire(adapterUrl)
const piDist = require.resolve.paths('@earendil-works/pi-ai')
  .map(root => join(root, '@earendil-works/pi-ai/dist'))
  .find(root => existsSync(join(root, 'api/anthropic-messages.js')))
assert(piDist, 'use the pi-ai instance owned by the Harness adapter')
const wire = await import(pathToFileURL(join(piDist, 'api/anthropic-messages.js')).href)
const nativeWire = await import(pathToFileURL(join(piDist, 'api/openai-completions.js')).href)
const api = 'anthropic-messages'
const id = 'deepseek-v4.1-flash'
const original = [{ id, maxTokens: 8192, compat: { supportsStrictTools: false } }, { id: 'claude-opus-5-5' }]
const fixed = withProviderProtocolDefaults(api, original)
assert.equal(fixed[0].compat.allowEmptySignature, true)
assert.equal(fixed[0].compat.supportsStrictTools, false)
assert.equal(fixed[1], original[1])
assert.equal(original[0].compat.allowEmptySignature, undefined)
assert.equal(withProviderProtocolDefaults('openai-completions', original), original)
assert.equal(withProviderProtocolDefaults(api, original, { allowEmptySignature: false }), original)
const optedOut = { id, compat: { allowEmptySignature: false } }
assert.equal(withProviderProtocolDefaults(api, [optedOut])[0], optedOut)
let entries = original
const host = {
  listConfiguredProviders: () => [{ route: 'fixture', api, modelEntries: entries }],
  mutateProfile: async (route, ops) => {
    assert.equal(route, 'fixture')
    const modelOp = ops.find(op => op.path[0] === 'models')
    assert(modelOp)
    entries = modelOp.value
  },
}
assert.equal(withProviderProtocolDefaults(api, fixed)[0], fixed[0], 'defaults must be idempotent')
const manager = createProviderManager({
  ...host, listCatalogProviders: () => [], routeExists: () => true,
  envShadows: () => true,
}, () => true, () => 'FIXTURE_KEY')
await manager.configure({ kind: 'custom', route: 'fixture', api, models: [id, 'claude-opus-5-5'] })
assert.equal(entries[0].compat.allowEmptySignature, true, 'provider edits must retain replay compatibility')
await createProviderManager({
  ...host,
  listConfiguredProviders: () => [{ route: 'fixture', api, modelEntries: original, compat: { allowEmptySignature: false } }],
  listCatalogProviders: () => [], routeExists: () => true, envShadows: () => true,
}, () => true, () => 'FIXTURE_KEY').configure({ kind: 'custom', route: 'fixture', api, models: [id] })
assert.equal(entries[0], original[0], 'explicit provider opt-out survives model-list edits')

function adapter(compat, native = false) {
  const selectedWire = native ? nativeWire : wire
  const model = { id, name: id, api: native ? 'openai-completions' : api, provider: 'fixture', baseUrl: 'http://127.0.0.1:1',
    reasoning: true, input: ['text'], contextWindow: 32768, maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat }
  const provider = { id: 'fixture', name: 'Fixture', getModels: () => [model],
    auth: { apiKey: { name: 'Local fixture', resolve: async () => ({ auth: { apiKey: 'local-fixture' }, source: 'fixture' }) } }, stream: selectedWire.stream, streamSimple: selectedWire.streamSimple }
  const profiles = new Map([['fixture', { provider: 'fixture', displayName: 'Fixture', piProvider: provider,
    configuredMaxTokens: new Map(), modelErrors: new Map(), streamIdleTimeoutMs: 1000 }]])
  return new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => 'local-fixture',
    auth: { credentials: { read: async () => undefined, list: async () => [] }, authContext: {} } })
}
let mode = 'tool'
let requests = 0
const expectedThinking = 'Compare the saved synthesis resources before changing the constraints.'
const originalFetch = globalThis.fetch
// Block all external networking: the real SDK serializes requests into this local fixture.
globalThis.fetch = async (url, options) => {
  assert.equal(new URL(String(url instanceof Request ? url.url : url)).hostname, '127.0.0.1')
  requests++
  const body = JSON.parse(options?.body ?? await url.text())
  if (new URL(String(url instanceof Request ? url.url : url)).pathname.endsWith('/chat/completions')) {
    for (const message of body.messages.filter(message => message.role === 'assistant')) {
      if (message.reasoning_content !== expectedThinking) return new Response(JSON.stringify({ error: {
        message: 'Missing reasoning_content on native replay.', type: 'invalid_request_error',
      } }), { status: 400 })
    }
    return new Response('data: ' + JSON.stringify({ id: 'native-fixture', object: 'chat.completion.chunk',
      model: id, choices: [{ index: 0, delta: { role: 'assistant', content: 'Verified locally.' }, finish_reason: null }],
    }) + '\n\ndata: ' + JSON.stringify({ id: 'native-fixture', object: 'chat.completion.chunk', model: id,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    }) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  for (const message of body.messages.filter(message => message.role === 'assistant')) {
    const thinking = message.content.find(block => block.type === 'thinking')
    if (!thinking) return new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'The reasoning_content in the thinking mode must be passed back to the API.' } }), { status: 400 })
    assert.equal(thinking.thinking, expectedThinking)
    assert.equal(thinking.signature, '')
    assert(!message.content.some(block => block.type === 'text' && block.text === expectedThinking))
  }
  const events = []
  const send = (event, data) => events.push(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`)
  send('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', model: id, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } })
  send('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } })
  send('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: expectedThinking } })
  send('content_block_stop', { index: 0 })
  send('content_block_start', { index: 1, content_block: mode === 'tool'
    ? { type: 'tool_use', id: `tool-${requests}`, name: 'read', input: {} } : { type: 'text', text: '' } })
  send('content_block_delta', { index: 1, delta: mode === 'tool'
    ? { type: 'input_json_delta', partial_json: '{"file_path":"polynomial.py"}' } : { type: 'text_delta', text: 'Verified locally.' } })
  send('content_block_stop', { index: 1 })
  send('message_delta', { delta: { stop_reason: mode === 'tool' ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } })
  send('message_stop', {})
  return new Response(events.join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const tools = [{ name: 'read', description: 'Read saved source', parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] } }]
async function reply(client, messages) {
  const content = []
  let replayState
  for await (const chunk of client.stream({ provider: 'fixture', model: id, messages, tools, reasoningEffort: 'medium' })) {
    if (chunk.type === 'block-end') content[chunk.index] = chunk.block
    if (chunk.type === 'finish') {
      if (chunk.reason.kind === 'error') throw new Error(chunk.reason.failure.message)
      replayState = chunk.replayState
    }
  }
  assert(replayState, 'Harness must preserve provider replay metadata')
  return { role: 'assistant', source: { kind: 'model', provider: 'fixture', model: id, replayState }, content }
}
function toolResult(message) {
  const tool = message.content.find(block => block.type === 'tool-call')
  return { role: 'tool', source: { kind: 'tool', callId: tool.id }, toolCallId: tool.id, content: [{ type: 'text', text: 'Saved source.' }] }
}
const root = await mkdtemp(join(tmpdir(), 'flagqai-thinking-'))
try {
  const history = [{ role: 'user', content: [{ type: 'text', text: 'Compare synthesis constraints.' }] }]
  const first = await reply(adapter(original[0].compat), history)
  history.push(first, toolResult(first))
  await assert.rejects(reply(adapter(original[0].compat), history), /reasoning_content/, 'must reproduce the reported protocol failure')
  const client = adapter(fixed[0].compat)
  const second = await reply(client, history)
  history.push(second, toolResult(second))
  mode = 'text'
  const final = await reply(client, history)
  history.push(final, { role: 'user', content: [{ type: 'text', text: 'Why?' }] })
  await writeFile(join(root, 'history.json'), JSON.stringify(history))
  const restored = JSON.parse(await readFile(join(root, 'history.json'), 'utf8'))
  const resumed = await reply(adapter(fixed[0].compat), restored)
  assert(resumed.content.some(block => block.type === 'text' && block.text === 'Verified locally.'))
  const before = JSON.stringify(restored)
  const migrated = nativeDeepSeekHistory({ provider: 'fixture', model: id, messages: restored }, 'openai-completions')
  const nativeReply = await reply(adapter(undefined, true), migrated)
  assert(nativeReply.content.some(block => block.type === 'text' && block.text === 'Verified locally.'))
  assert.equal(JSON.stringify(restored), before, 'native serialization never mutates restored history')
  assert.equal(requests, 6, 'every explicit fixture request is dispatched once')
  console.log('Thinking replay OK: reproduced 400, repaired unsigned thinking, two tool rounds, next user turn, durable reload, native wire serialization, idempotent settings, explicit opt-out; no model calls.')
} finally {
  globalThis.fetch = originalFetch
  await rm(root, { recursive: true, force: true })
}
