import assert from 'node:assert/strict'
import { nativeDeepSeekHistory } from '../src/dsh-adapter/compat/deepseekReplay.js'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
const model = 'deepseek-v4.1-flash'
const message = { role: 'assistant', content: [{ type: 'reasoning', text: 'Compare resources.' }, { type: 'tool-call', id: 'call1', name: 'read', arguments: '{}' }],
  source: { kind: 'model', provider: 'bridge', model, replayState: {
    response: { kind: 'pi-ai', version: 2, api: 'anthropic-messages', provider: 'bridge', model, stopReason: 'toolUse' },
    blocks: [{ type: 'reasoning', thinkingSignature: '' }, { type: 'tool-call' }],
  } } }
const request = JSON.parse(JSON.stringify({ provider: 'native', model, messages: [message] })) as GenerateOptions
const before = JSON.stringify(request)
const migrated = nativeDeepSeekHistory(request, 'openai-completions', ['native', 'bridge'])
assert.notEqual(migrated, request.messages)
const source = (migrated[0] as unknown as typeof message).source
assert.equal(source.provider, 'native')
assert.equal(source.replayState.response.provider, 'native')
assert.equal(source.replayState.response.api, 'openai-completions')
assert.equal(source.replayState.blocks[0]!.thinkingSignature, 'reasoning_content')
assert.equal(JSON.stringify(request), before, 'never alter durable history')
const returned = structuredClone(migrated) as unknown as typeof message[]
returned[0]!.source.provider = 'bridge'
returned[0]!.source.replayState.response.provider = 'bridge'
const routedAgain = nativeDeepSeekHistory({ ...request, messages: returned as unknown as GenerateOptions['messages'] }, 'openai-completions', ['native', 'bridge'])
assert.equal((routedAgain[0] as unknown as typeof message).source.provider, 'native')
assert.equal((routedAgain[0] as unknown as typeof message).source.replayState.blocks[0]!.thinkingSignature, 'reasoning_content')
assert.equal(nativeDeepSeekHistory({ ...request, messages: migrated }, 'openai-completions', ['native', 'bridge']), migrated)
assert.equal(nativeDeepSeekHistory(request, 'anthropic-messages', ['native', 'bridge']), request.messages)
assert.equal(nativeDeepSeekHistory(request, 'openai-completions'), request.messages)
assert.equal(nativeDeepSeekHistory({ ...request, model: 'other' }, 'openai-completions', ['native', 'bridge']), request.messages)
for (const signature of ['signed', '{"encrypted":"opaque"}']) {
 const signed = structuredClone(request)
 ;(signed.messages[0] as unknown as typeof message).source.replayState.blocks[0]!.thinkingSignature = signature
 assert.equal(nativeDeepSeekHistory(signed, 'openai-completions', ['bridge']), signed.messages)
}
const broken = structuredClone(request)
;(broken.messages[0] as unknown as typeof message).source.replayState.blocks.pop()
assert.equal(nativeDeepSeekHistory(broken, 'openai-completions', ['bridge']), broken.messages)
console.log('PASS DeepSeek history migration: exact model, trusted routes, unsigned blocks, immutable and idempotent; signed/foreign/malformed history untouched')

const { deepSeekReplayStream } = await import('../src/dsh-adapter/compat/deepseekStream.js')
const controller = new AbortController()
const bridgeRequest = Object.freeze({ ...request, provider: 'bridge', signal: controller.signal })
const route = { route: 'bridge', ref: 'SAME_KEY', shadowed: false, isCatalog: false,
  api: 'anthropic-messages', baseURL: 'https://zyapi.xmsxb.com', models: [model] }
const nativeRoute = { ...route, route: 'native', api: 'openai-completions', baseURL: route.baseURL + '/v1' }
let calls = 0
let defaults = 0
const next = async function* () { defaults++; }
const nativeStream = async function* (options: GenerateOptions) {
  calls++
  assert.equal(options.provider, 'native')
  assert.equal(options.signal, controller.signal, 'cancellation reaches the actual request')
  assert.equal(options.reasoningEffort, 'medium')
  assert.equal((options.messages[0] as unknown as typeof message).source.provider, 'native')
  yield { type: 'finish', reason: { kind: 'stop' }, replayState: {
    response: { kind: 'pi-ai', version: 2, provider: 'native', model, api: 'openai-completions', stopReason: 'stop' }, blocks: [],
  } } as import('@deepseek-ai/dsh-llm').StreamChunk
}
const chunks = []
for await (const chunk of deepSeekReplayStream(bridgeRequest, [route, nativeRoute], nativeStream, next)) chunks.push(chunk)
assert.equal(calls, 1, 'dispatch exactly once; do not replay tools or retry model errors')
assert.equal(defaults, 0)
assert.equal((chunks[0] as unknown as { replayState: { response: { provider: string } } }).replayState.response.provider, 'bridge')
for (const bad of [undefined, { ...nativeRoute, ref: 'OTHER_KEY' }, { ...nativeRoute, baseURL: 'https://other.example' },
  { ...nativeRoute, models: ['another-model'] }, { ...nativeRoute, hasCustomHeaders: true }]) {
  for await (const chunk of deepSeekReplayStream(bridgeRequest, bad ? [route, bad] : [route], nativeStream, next)) {
    assert.equal(chunk.type, 'finish')
    assert.equal((chunk as { reason: { kind: string } }).reason.kind, 'error')
  }
}
for (const profiles of [
  [{ ...route, ref: '' }, { ...nativeRoute, ref: '' }],
  [{ ...route, ref: ' ' }, { ...nativeRoute, ref: ' ' }],
  [{ ...route, hasCustomHeaders: true }, nativeRoute],
]) {
  const rejected = []
  for await (const chunk of deepSeekReplayStream(bridgeRequest, profiles, nativeStream, next)) rejected.push(chunk)
  assert.equal(rejected.length, 1)
  assert.equal((rejected[0] as { reason: { kind: string } }).reason.kind, 'error')
}
assert.equal(calls, 1, 'missing/mismatched native connections fail before a billable call')
for await (const _ of deepSeekReplayStream({ ...bridgeRequest, model: 'claude-opus-5-5' }, [route, nativeRoute], nativeStream, next)) {}
assert.equal(defaults, 1, 'other models keep their original transport')

// Exercise the same re-entry used by the native llm/stream middleware rather
// than stopping at the first dispatch callback.
let wireCalls = 0
let middlewareCalls = 0
const dispatch = (options: GenerateOptions): AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk> => {
  middlewareCalls++
  assert(middlewareCalls <= 2, 'normalized replay must not recursively dispatch')
  return deepSeekReplayStream(options, [route, nativeRoute], dispatch, async function* () {
    wireCalls++
    assert.equal(options.provider, 'native')
    assert.equal(options.signal, controller.signal)
    assert.equal(options.reasoningEffort, 'high', 'explicit user effort remains unchanged')
    assert.equal((options.messages[0] as unknown as typeof message).source.replayState.response.api, 'openai-completions')
    yield { type: 'finish', reason: { kind: 'error', failure: {
      code: 'FIXTURE_FAILURE', message: 'Do not retry this failed model request.',
    } } } as import('@deepseek-ai/dsh-llm').StreamChunk
  })
}
const frozenBefore = JSON.stringify(bridgeRequest)
for await (const chunk of dispatch({ ...bridgeRequest, reasoningEffort: 'high' })) {
  assert.equal(chunk.type, 'finish')
  assert.equal((chunk as { reason: { kind: string } }).reason.kind, 'error')
}
assert.equal(wireCalls, 1, 'provider failure is returned without retry')
assert.equal(middlewareCalls, 2)
assert.equal(JSON.stringify(bridgeRequest), frozenBefore, 'dispatch never changes persisted input')
console.log('PASS gateway dispatch: exactly once, same endpoint/credential/model, cancellation, stable history identity, bounded middleware re-entry and fail closed without a native route')
