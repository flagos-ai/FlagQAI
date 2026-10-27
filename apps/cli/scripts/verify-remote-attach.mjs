import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { parseAttachArgs } from '../bin/attach-args.js'
import { ATTACH_INTERACTIVE_HELP, createEventRenderer, createInteractionResponder, formatAttachConfig, runAttachCli } from '../bin/attach.js'

assert.deepEqual(parseAttachArgs([]), { help: true })
assert.deepEqual(
  parseAttachArgs(['http://127.0.0.1:4096', '--backend', 'claude', '--cwd=/work', '--session', 'native-1', '--json']),
  {
    help: false,
    baseUrl: 'http://127.0.0.1:4096',
    backendId: 'claude',
    cwd: '/work',
    sessionId: 'native-1',
    resourceId: undefined,
    json: true,
    prompt: undefined,
  },
)
assert.equal(parseAttachArgs(['http://localhost:4096', '--', '--help']).prompt, '--help')
assert.throws(() => parseAttachArgs(['http://localhost:4096', '--ink']), /unknown flagqai attach option: --ink/)
assert.throws(() => parseAttachArgs(['http://localhost:4096', '--vim']), /unknown flagqai attach option: --vim/)
assert.throws(() => parseAttachArgs(['http://example.com']), /require HTTPS/)
assert.throws(() => parseAttachArgs(['https://user:secret@example.com']), /must not contain credentials/)
assert.throws(
  () => parseAttachArgs(['https://example.com', '--session', 'a', '--resource', 'b']),
  /cannot be used together/,
)
assert.match(ATTACH_INTERACTIVE_HELP, /\/config.*attached session/)
assert.equal(formatAttachConfig({
  baseUrl: 'https://example.com/path?token=secret#fragment',
  session: { id: 'resource-1', backendId: 'dsh', sessionId: 'native-1', cwd: '/work', status: 'idle' },
  models: { available: true, current: { provider: 'fixture', model: 'first' } },
}), 'Attached service: https://example.com\nBackend: "dsh"\nSession: "native-1" · resource "resource-1"\nWorkspace: "/work"\nStatus: "idle"\nModel: "fixture/first"\n')

let rendered = ''
const render = createEventRenderer({ write: value => { rendered += value } })
render({ event: { type: 'assistant.delta', attemptId: 'a', delta: { kind: 'text', text: 'streamed' } } })
render({ event: { type: 'assistant.message', attemptId: 'a', blocks: [{ type: 'text', text: 'streamed' }] } })
render({ event: { type: 'assistant.message', attemptId: 'b', blocks: [{ type: 'text', text: 'settled' }] } })
render({ event: { type: 'permission.request', request: {} } })
assert.equal(rendered, 'streamed\nsettled\n')
render({ meta: { replay: true }, event: { type: 'assistant.delta', attemptId: 'history-stream', delta: { kind: 'text', text: 'historical answer' } } })
render({ meta: { replay: true }, event: { type: 'assistant.message', attemptId: 'history-settled', blocks: [{ type: 'text', text: 'historical answer' }] } })
assert.equal(rendered, 'streamed\nsettled\nhistorical answer\n')
render({ event: { type: 'assistant.attempt.start', attemptId: 'live-stream', turn: 2, step: 1 } })
render({ event: { type: 'assistant.delta', attemptId: 'live-stream', delta: { kind: 'text', text: 'one answer' } } })
render({ event: { type: 'assistant.message', attemptId: 'seq:42', turn: 2, step: 1, blocks: [{ type: 'text', text: 'one answer, finished' }] } })
assert.equal(rendered, 'streamed\nsettled\nhistorical answer\none answer, finished\n')
render({ event: { type: 'pending.changed', items: [{ id: 'q', text: 'Run tests next', placement: 'followup' }] } })
render({ event: { type: 'session.control', state: 'unknown', outcome: 'unknown', stillQueued: ['q'] } })
assert.match(rendered, /\[next task\] Run tests next/)
assert.match(rendered, /\[stop\] unknown · queue withdrawal unknown · 1 may still run/)

const interactionCalls = []
const scriptedAnswers = ['1', '2']
const interactionOutput = []
const respond = createInteractionResponder({
  client: {
    answerPermission: async (...args) => { interactionCalls.push(['permission', ...args]) },
    answerQuestion: async (...args) => { interactionCalls.push(['question', ...args]) },
    cancelQuestion: async (...args) => { interactionCalls.push(['cancel', ...args]) },
  },
  sessionId: 'resource-1',
  ask: async () => scriptedAnswers.shift(),
  write: value => interactionOutput.push(value),
  warn: value => interactionOutput.push(value),
})
await respond({ event: { type: 'permission.request', request: {
  requestId: 'permission-1', toolName: 'shell', command: 'npm test',
  options: [{ id: 'once', kind: 'allow-once', label: 'Allow once' }, { id: 'no', kind: 'reject', label: 'Reject' }],
} } })
await respond({ event: { type: 'question.request', request: {
  requestId: 'question-1', questions: [{ question: 'Which target?', options: [{ label: 'CPU' }, { label: 'GPU' }] }],
} } })
assert.deepEqual(interactionCalls, [
  ['permission', 'resource-1', 'permission-1', { kind: 'allow-once' }],
  ['question', 'resource-1', 'question-1', { answers: [{ selected: ['GPU'] }] }],
])

const encoder = new TextEncoder()
let legacyTurn = false
let endReason = { kind: 'completed' }
let streamController
const pendingChunks = []
let nextId = 1
const frame = event => {
  const record = { id: nextId++, session: 'resource-1', event, meta: { wake: 'immediate' } }
  return encoder.encode(`id: ${record.id}\nevent: agent-event\ndata: ${JSON.stringify(record)}\n\n`)
}
const emit = event => {
  const chunk = frame(event)
  if (streamController === undefined) pendingChunks.push(chunk)
  else streamController.enqueue(chunk)
}
const fetch = async (request, init = {}) => {
  const url = new URL(request)
  if (url.pathname === '/v1/health') {
    return Response.json({ product: 'FlagQAI', protocolVersion: '2026-10-14.1', status: 'ready', backendCount: 1 })
  }
  if (url.pathname === '/v1/backends') {
    return Response.json({ backends: [{ id: 'dsh', label: 'Harness', detection: { installed: true } }] })
  }
  if (url.pathname === '/v1/sessions' && init.method === 'POST') {
    return Response.json({ session: { id: 'resource-1', backendId: 'dsh', sessionId: 'native-1', cwd: '/work', status: 'idle', capabilities: [] } }, { status: 201 })
  }
  if (url.pathname === '/v1/sessions/resource-1/events') {
    return new Response(new ReadableStream({
      start(controller) {
        streamController = controller
        init.signal?.addEventListener('abort', () => controller.close(), { once: true })
        emit({ type: 'session.ready', sessionId: 'native-1', cwd: '/work', model: 'test' })
        for (const chunk of pendingChunks.splice(0)) controller.enqueue(chunk)
      },
      cancel() {},
    }), { headers: { 'content-type': 'text/event-stream' } })
  }
  if (url.pathname === '/v1/sessions/resource-1/messages' && init.method === 'POST') {
    const body = JSON.parse(init.body)
    queueMicrotask(() => {
      emit({ type: 'turn.start', turn: 1, origin: 'user', ...(legacyTurn ? {} : { userMessageId: body.clientMessageId }), time: 1 })
      if (legacyTurn) emit({ type: 'user.message', id: body.clientMessageId, source: 'user', text: body.text, blocks: [] })
      emit({ type: 'assistant.message', seq: 1, anchor: 'a', turn: 1, step: 1, attemptId: 'a', time: 2, canonical: true, blocks: [{ type: 'text', text: 'remote answer' }] })
      emit({ type: 'turn.end', turn: 1, reason: endReason, time: 3 })
    })
    return Response.json({ receipt: { accepted: true } }, { status: 202 })
  }
  throw new Error(`unexpected request ${init.method ?? 'GET'} ${url.pathname}`)
}

const output = { value: '', write(value) { this.value += value } }
const errors = { value: '', write(value) { this.value += value } }
const exit = await runAttachCli(
  ['http://127.0.0.1:4096', '--cwd', '/work', '--prompt', 'remote task'],
  { fetch, stdout: output, stderr: errors, cwd: '/fallback', stdin: { isTTY: false } },
)
assert.equal(exit, 0)
assert.equal(errors.value, '')
assert.match(output.value, /Resource resource-1 · dsh session native-1/)
assert.match(output.value, /remote answer/)

legacyTurn = true
streamController = undefined
assert.equal(await runAttachCli(
  ['http://127.0.0.1:4096', '--json', '--prompt', 'legacy turn'],
  { fetch, stdout: output, stderr: errors, stdin: { isTTY: false } },
), 0, 'native turn-start without userMessageId must correlate through the user message')

for (const reason of [{ kind: 'error', message: 'Provider rejected credentials (401)' },
  { kind: 'blocked', detail: 'Tool access denied' }, { kind: 'aborted' }, { kind: 'interrupted' }]) {
  endReason = reason
  streamController = undefined
  errors.value = ''
  const failed = await runAttachCli(
    ['http://127.0.0.1:4096', '--json', '--prompt', 'failing task'],
    { fetch, stdout: output, stderr: errors, stdin: { isTTY: false } },
  )
  assert.equal(failed, 1, `${reason.kind} must not report success`)
  assert.match(errors.value, new RegExp(`task ${reason.kind}`))
  assert.match(errors.value, /Reattach to inspect/)
}

console.log('PASS FlagQAI remote attach parsing, event rendering, and SDK session flow')

// A model switch replaces the server resource, so the old event stream must
// close before the new one starts; no user message may be posted to the
// disposed resource.
{
  const commands = ['/help', '/config', '/model', '/model 2', '/exit']
  const terminal = new EventEmitter()
  let permissionAnswered = false
  terminal.question = (prompt, {signal} = {}) => {
    if (prompt === 'Choose an option: ') return Promise.resolve('1')
    if (commands.length > 1 || permissionAnswered) return Promise.resolve(commands.shift())
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}))
  }
  terminal.close = () => {}
  const display = {value: '', write(value) { this.value += value }}
  let oldClosed = false
  let switched = false
  let newStreamOpened = false
  let loseSwitchReceipt = false
  let serverBusy = false
  let oldStreamOpens = 0
  const resource = id => ({id, backendId: 'dsh', sessionId: 'native-1', cwd: '/work', status: 'idle', capabilities: []})
  const modelFetch = async (request, init = {}) => {
    const path = new URL(request).pathname
    if (path === '/v1/health') return Response.json({protocolVersion: '2026-10-14.1', status: 'ready'})
    if (path === '/v1/sessions/resource-1') return Response.json({session: resource('resource-1')})
    if (path === '/v1/sessions/resource-1/models') return Response.json({available: true,
      current: {provider: 'fixture', model: 'first'}, models: [
        {provider: 'fixture', id: 'first', label: 'First'},
        {provider: 'fixture', id: 'second', label: 'Second'},
      ]})
    if (path === '/v1/sessions/resource-1/model' && init.method === 'POST') {
      assert.equal(oldClosed, true, 'old SSE must stop before switching resources')
      assert.deepEqual(JSON.parse(init.body), {provider: 'fixture', model: 'second'})
      if (serverBusy) return Response.json({error: {code: 'session_busy', message: 'Finish the current turn'}}, {status: 409})
      if (loseSwitchReceipt) throw new Error('switch receipt lost')
      switched = true
      return Response.json({session: resource('resource-2')})
    }
    if (path === '/v1/sessions/resource-2/permissions/p-2' && init.method === 'POST') {
      assert.deepEqual(JSON.parse(init.body), {kind: 'allow-once'})
      permissionAnswered = true
      return Response.json({receipt: {accepted: true}})
    }
    if (path === '/v1/sessions/resource-1/events' || path === '/v1/sessions/resource-2/events') {
      if (path.includes('resource-1')) oldStreamOpens++
      if (path.includes('resource-2')) newStreamOpened = true
      return new Response(new ReadableStream({start(controller) {
        if (path.includes('resource-2')) queueMicrotask(() => controller.enqueue(encoder.encode(
          `id: 1\nevent: agent-event\ndata: ${JSON.stringify({id: 1, session: 'resource-2',
            event: {type: 'permission.request', request: {requestId: 'p-2', toolName: 'fixture-tool',
              options: [{id: 'once', kind: 'allow-once', label: 'Allow once'}]}}, meta: {wake: 'immediate'}})}\n\n`)))
        init.signal.addEventListener('abort', () => {
          if (path.includes('resource-1')) oldClosed = true
          controller.close()
        }, {once: true})
      }}), {headers: {'content-type': 'text/event-stream'}})
    }
    throw new Error(`unexpected model-switch request ${init.method ?? 'GET'} ${path}`)
  }
  const code = await runAttachCli(['http://localhost:4096', '--resource', 'resource-1'], {
    fetch: modelFetch, stdout: display, stderr: display, stdin: {isTTY: true},
    createTerminal: () => terminal,
  })
  assert.equal(code, 0)
  assert.equal(switched, true)
  assert.equal(newStreamOpened, true)
  assert.equal(permissionAnswered, true, 'native interaction must target the replacement resource')
  assert.match(display.value, /Local commands:/)
  assert.match(display.value, /Attached service: http:\/\/localhost:4096/)
  assert.match(display.value, /Model: "fixture\/first"/)
  assert.match(display.value, /2\. "fixture\/second"/)
  assert.match(display.value, /Model switched to "fixture\/second" · resource resource-2/)
  assert.match(display.value, /--resource resource-2/)

  serverBusy = true
  oldClosed = false
  newStreamOpened = false
  const busyCommands = ['/model 2', '/exit']
  const busyTerminal = new EventEmitter()
  busyTerminal.question = async () => busyCommands.shift()
  busyTerminal.close = () => {}
  const busyOutput = {value: '', write(value) { this.value += value }}
  const oldBeforeBusy = oldStreamOpens
  const busyCode = await runAttachCli(['http://localhost:4096', '--resource', 'resource-1'], {
    fetch: modelFetch, stdout: busyOutput, stderr: busyOutput, stdin: {isTTY: true},
    createTerminal: () => busyTerminal,
  })
  assert.equal(busyCode, 0, 'an explicit busy response must keep the current resource')
  assert.equal(oldStreamOpens, oldBeforeBusy + 2, 'the old stream must reconnect after an explicit busy response')
  assert.equal(newStreamOpened, false)
  assert.match(busyOutput.value, /session_busy: Finish the current turn Current session retained/)

  serverBusy = false
  loseSwitchReceipt = true
  oldClosed = false
  newStreamOpened = false
  const failedTerminal = new EventEmitter()
  failedTerminal.question = async () => '/model 2'
  failedTerminal.close = () => {}
  const failedOutput = {value: '', write(value) { this.value += value }}
  const failed = await runAttachCli(['http://localhost:4096', '--resource', 'resource-1'], {
    fetch: modelFetch, stdout: failedOutput, stderr: failedOutput, stdin: {isTTY: true},
    createTerminal: () => failedTerminal,
  })
  assert.equal(failed, 1, 'an uncertain switch receipt must detach, not retry')
  assert.equal(newStreamOpened, false, 'an uncertain switch must not guess a replacement resource')
  assert.match(failedOutput.value, /switch receipt lost/)
  assert.match(failedOutput.value, /Inspect the session before retrying/)
}
console.log('PASS attach model listing, resource switch, busy response, and lost-receipt boundary')

// A transport fault is not evidence that the server did not accept a message.
// Never retry POST automatically; restore the durable resource instead.
assert.equal(parseAttachArgs(['http://localhost:4096', '--timeout', '2', '--prompt', 'task']).timeoutSeconds, 2)
for (const value of ['0', '-1', '1.5', 'NaN', '2147484']) {
  assert.throws(() => parseAttachArgs(['http://localhost:4096', `--timeout=${value}`, '--prompt', 'task']), /timeout/)
}
assert.throws(() => parseAttachArgs(['http://localhost:4096', '--timeout=1']), /one-shot/)
for (const mode of ['eof', 'transport', 'receipt-lost', 'pending-receipt', 'deadline', 'SIGINT', 'SIGTERM', 'cancel-failure', 'cancel-timeout']) {
  const signals = new EventEmitter()
  let stream, posts = 0, cancellations = 0
  const pendingRecovery = []
  const capture = { value: '', write(value) { this.value += value } }
  const session = { id: 'resource-1', backendId: 'dsh', sessionId: 'native-1', cwd: '/work', status: 'running', capabilities: [] }
  const fixture = async (request, init = {}) => {
    const path = new URL(request).pathname
    if (path === '/v1/sessions/resource-1') return Response.json({ session })
    if (path.endsWith('/cancel')) {
      cancellations++
      assert.deepEqual(JSON.parse(init.body), { cause: 'interrupt' })
      if (mode === 'cancel-failure') throw new Error('server unavailable')
      if (mode === 'cancel-timeout') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
      return Response.json({ receipt: { outcome: 'requested' } })
    }
    if (path.endsWith('/events')) return new Response(new ReadableStream({
      start(controller) { stream = controller },
      cancel() {},
    }), { headers: { 'content-type': 'text/event-stream' } })
    if (path.endsWith('/messages')) {
      posts++
      if (mode === 'receipt-lost') throw new Error('message receipt lost')
      stream.enqueue(frame({ type: 'turn.start', turn: 1, userMessageId: JSON.parse(init.body).clientMessageId }))
      setTimeout(() => {
        if (mode === 'eof' || mode === 'pending-receipt') stream.close()
        else if (mode === 'transport') stream.error(new Error('connection reset'))
        else if (mode !== 'deadline') signals.emit(mode.startsWith('cancel-') ? 'SIGINT' : mode)
      }, 10)
      if (mode === 'pending-receipt') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
      return Response.json({ receipt: { accepted: true } }, { status: 202 })
    }
    return fetch(request, init)
  }
  const keepAlive = setInterval(() => {}, 1000)
  const before = Date.now()
  const code = await runAttachCli(['http://localhost:4096', '--resource', 'resource-1', '--prompt', 'Bell task', ...(mode === 'deadline' ? ['--timeout=1'] : [])],
    { fetch: fixture, signalSource: signals, stdout: capture, stderr: capture, stdin: { isTTY: false },
      onDetachWithPendingWork: (active, baseUrl) => pendingRecovery.push({active, baseUrl}) })
  clearInterval(keepAlive)
  assert.equal(code, mode === 'SIGTERM' ? 143 : mode === 'SIGINT' || mode.startsWith('cancel-') ? 130 : 1, mode)
  assert.equal(posts, 1, 'a lost stream or receipt must never cause a duplicate submission')
  assert.equal(cancellations, mode === 'SIGINT' || mode.startsWith('cancel-') ? 1 : 0, mode)
  assert.deepEqual(pendingRecovery, [{active: session, baseUrl: 'http://localhost:4096'}],
    `${mode}: uncertain work must retain the service once`)
  assert.match(capture.value, /--resource resource-1/)
  assert.match(capture.value, /--session native-1/)
  if (mode.startsWith('cancel-')) assert.match(capture.value, /could not be confirmed/)
  assert.ok(Date.now() - before < 7000, 'cancellation must be bounded')
  assert.equal(signals.listenerCount('SIGINT'), 0)
  assert.equal(signals.listenerCount('SIGTERM'), 0)
  if (mode === 'eof') console.log(`Captured attach disconnect output:\n${capture.value.trim()}`)
}
console.log('PASS attach EOF/reset/lost receipt/deadline, cancellation receipts/failures, detach, and signal cleanup')

for (const mode of ['idle-interrupt', 'task-interrupt', 'permission-interrupt', 'idle-eof', 'exit']) {
  const input = new PassThrough()
  input.isTTY = true
  const output = new PassThrough()
  let printed = '', triggered = false, cancellations = 0, preserved = 0
  output.on('data', chunk => {
    printed += chunk.toString()
    if (!triggered && mode !== 'idle-eof' && printed.includes('> ')) {
      triggered = true
      setTimeout(() => input.write(mode === 'exit' ? '/exit\n' : mode === 'idle-interrupt' ? '\x03' : 'Bell task\n'), 10)
    }
  })
  const signals = new EventEmitter()
  let stream
  const session = { id: 'resource-1', backendId: 'dsh', sessionId: 'native-1', cwd: '/work', status: 'idle', capabilities: [] }
  const terminalFetch = async (request, init = {}) => {
    const path = new URL(request).pathname
    if (path === '/v1/sessions/resource-1') return Response.json({ session })
    if (path.endsWith('/events')) return new Response(new ReadableStream({ start(controller) {
      stream = controller
      if (mode === 'idle-eof') setTimeout(() => controller.close(), 20)
    }, cancel() {} }), { headers: { 'content-type': 'text/event-stream' } })
    if (path.endsWith('/messages')) {
      if (mode === 'permission-interrupt') stream.enqueue(frame({ type: 'permission.request', request: { requestId: 'approval', toolName: 'write' } }))
      setTimeout(() => input.write('\x03'), 20)
      return Response.json({ receipt: { accepted: true } }, { status: 202 })
    }
    if (path.endsWith('/cancel')) {
      cancellations++
      return Response.json({ receipt: { outcome: 'requested' } })
    }
    return fetch(request, init)
  }
  const code = await runAttachCli(['http://localhost:4096', '--resource', 'resource-1'], {
    fetch: terminalFetch, signalSource: signals, stdin: input, stdout: output, stderr: output,
    onDetachWithPendingWork: () => { preserved++ },
  })
  assert.equal(code, mode === 'exit' ? 0 : mode === 'idle-eof' ? 1 : 130, mode)
  assert.equal(cancellations, mode === 'task-interrupt' || mode === 'permission-interrupt' ? 1 : 0, mode)
  assert.equal(preserved, mode === 'task-interrupt' || mode === 'permission-interrupt' ? 1 : 0, mode)
  assert.equal(signals.listenerCount('SIGINT'), 0)
  input.destroy()
  output.destroy()
}
console.log('PASS readline Ctrl+C while idle/task/approval, idle EOF, and /exit detach')
