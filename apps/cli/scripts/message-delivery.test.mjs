import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

// The same HTTP/crash tests also run against a relocated release archive.
const installed = process.env.FLAGQAI_DELIVERY_TEST_PACKAGE_ROOT
const runtime = name => installed
  ? pathToFileURL(join(installed, 'lib/flagqai-platform', name))
  : new URL('../../../packages/' + name, import.meta.url)
const { createFlagQaiServer } = await import(runtime('server/index.mjs'))
const { messageDeliveryStore } = await import(runtime('server/message-delivery-store.mjs'))
const { createFlagQaiClient } = await import(runtime('sdk/index.mjs'))

function backend(ledger, submit = async () => ({ accepted: true })) {
  return {
    descriptor: { id: 'local', label: 'Local delivery fixture' },
    async open(target) {
      return {
        ref: { backendId: 'local', sessionId: target.sessionId ?? 'qaoa-fixture' },
        cwd: target.cwd, status: 'idle',
        history: async () => [], subscribe: () => () => {}, dispose: async () => {},
        async submit(input) {
          await appendFile(ledger, JSON.stringify({ id: input.clientMessageId, text: input.text }) + '\n', { flush: true })
          return submit(input)
        },
      }
    },
  }
}
async function serve(root, options = {}) {
  const native = options.backend ?? backend(join(root, 'submissions.jsonl'))
  const server = createFlagQaiServer({
    port: 0, messageDeliveryDirectory: join(root, 'delivery'),
    registry: { ids: ['local'], load: async () => native }, ...options,
  })
  const address = await server.listen()
  const baseUrl = 'http://127.0.0.1:' + address.port
  return { server, baseUrl, client: createFlagQaiClient({ baseUrl }) }
}
const open = (client, cwd, sessionId) => client.openSession({ backendId: 'local', cwd, ...(sessionId ? { sessionId } : {}) })
const count = async root => {
  try { return (await readFile(join(root, 'submissions.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).length }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error }
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code)

if (process.argv[2] === '--delivery-fixture') {
  const root = process.argv[3]
  const native = backend(join(root, 'submissions.jsonl'), async input => {
    if (input.text === 'interrupt QAOA submission') {
      process.send({ submitted: true })
      await new Promise(() => {})
    }
    return input.text === 'refuse' ? { accepted: false, reason: 'Fixture refusal' } : { accepted: true }
  })
  const { baseUrl } = await serve(root, { backend: native })
  process.send({ baseUrl })
} else {
  async function fixture(t, root) {
    const child = fork(fileURLToPath(import.meta.url), ['--delivery-fixture', root], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    let diagnostics = ''
    child.stderr.on('data', data => { diagnostics += data })
    const stop = async () => {
      if (child.exitCode !== null || child.signalCode !== null) return
      const ended = once(child, 'exit')
      child.kill('SIGKILL')
      await ended
    }
    t.after(stop)
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Delivery fixture timed out: ' + diagnostics)), 10000)
      child.once('error', error => { clearTimeout(timeout); reject(error) })
      child.once('exit', code => { clearTimeout(timeout); reject(new Error('Delivery fixture exited: ' + code + diagnostics)) })
      child.once('message', message => { clearTimeout(timeout); resolve(message) })
    })
    const { baseUrl } = await ready
    return { child, stop, baseUrl, client: createFlagQaiClient({ baseUrl }) }
  }
  async function temporary(t) {
    const root = await mkdtemp(join(tmpdir(), 'flagqai-delivery-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    return root
  }

  test('lost receipt survives process termination and resumes under a new resource without resubmission', { timeout: 30000 }, async t => {
    const root = await temporary(t)
    const first = await fixture(t, root)
    const session = await open(first.client, root)
    const input = { clientMessageId: 'qaoa/receipt?1', text: 'Run saved QAOA code' }
    const lost = createFlagQaiClient({ baseUrl: first.baseUrl, fetch: async (url, init) => {
      const response = await fetch(url, init)
      assert.equal(response.status, 202)
      await response.text()
      throw new Error('Simulated lost HTTP receipt')
    } })
    await assert.rejects(lost.submitMessage(session.id, input), /lost HTTP receipt/)
    assert.equal(await count(root), 1)
    await first.stop()
    const second = await fixture(t, root)
    const resumed = await open(second.client, root, session.sessionId)
    assert.notEqual(resumed.id, session.id)
    assert.deepEqual(await second.client.messageDelivery(resumed.id, input.clientMessageId), { status: 'accepted' })
    assert.deepEqual(await second.client.submitMessage(resumed.id, input), { accepted: true })
    await rejectsCode(second.client.submitMessage(resumed.id, { ...input, text: 'Changed code' }), 'message_id_conflict')
    assert.equal(await count(root), 1)
  })

  test('request dropped before reaching server is retryable with the same ID after restart', { timeout: 30000 }, async t => {
    const root = await temporary(t)
    const first = await fixture(t, root)
    const session = await open(first.client, root)
    const input = { clientMessageId: 'qaoa-never-arrived', text: 'Run saved QAOA code' }
    const disconnected = createFlagQaiClient({ baseUrl: first.baseUrl, fetch: async () => { throw new Error('Offline before dispatch') } })
    await assert.rejects(disconnected.submitMessage(session.id, input), /Offline/)
    await first.stop()
    const second = await fixture(t, root)
    const resumed = await open(second.client, root, session.sessionId)
    assert.deepEqual(await second.client.messageDelivery(resumed.id, input.clientMessageId), { status: 'not_received' })
    assert.equal(await count(root), 0)
    await second.client.submitMessage(resumed.id, input)
    await second.client.submitMessage(resumed.id, input)
    assert.equal(await count(root), 1)
  })

  test('crash after admission retains an unknown outcome and refuses duplicate execution', { timeout: 30000 }, async t => {
    const root = await temporary(t)
    const first = await fixture(t, root)
    const session = await open(first.client, root)
    const input = { clientMessageId: 'qaoa-interrupted', text: 'interrupt QAOA submission' }
    const submitted = once(first.child, 'message')
    const pending = first.client.submitMessage(session.id, input).catch(error => error)
    await submitted
    assert.deepEqual(await first.client.messageDelivery(session.id, input.clientMessageId), { status: 'unconfirmed' })
    await first.stop()
    await pending
    const second = await fixture(t, root)
    const resumed = await open(second.client, root, session.sessionId)
    assert.deepEqual(await second.client.messageDelivery(resumed.id, input.clientMessageId), { status: 'unconfirmed' })
    await rejectsCode(second.client.submitMessage(resumed.id, input), 'message_outcome_unknown')
    assert.equal(await count(root), 1)
  })

  test('refusal and input fingerprints persist; preparing attachments remains unconfirmed', { timeout: 15000 }, async t => {
    const root = await temporary(t)
    let release
    const preparing = new Promise(resolve => { release = resolve })
    let entered
    const attached = new Promise(resolve => { entered = resolve })
    const { server, client, baseUrl } = await serve(root, {
      backend: backend(join(root, 'submissions.jsonl'), async () => ({ accepted: false, reason: 'Fixture refusal' })),
      contextManager: { async prepare(_session, input) { entered(); await preparing; return input } },
    })
    t.after(() => { release(); return server.close() })
    const session = await open(client, root)
    const input = { clientMessageId: 'refused', text: 'same text', placement: 'turn' }
    const pending = client.submitMessage(session.id, input)
    await attached
    assert.deepEqual(await client.messageDelivery(session.id, input.clientMessageId), { status: 'unconfirmed' })
    await rejectsCode(client.submitMessage(session.id, input), 'input_preparation_in_progress')
    release()
    assert.deepEqual(await pending, { accepted: false, reason: 'Fixture refusal' })
    await client.disposeSession(session.id)
    const resumed = await open(client, root, session.sessionId)
    assert.deepEqual(await client.messageDelivery(resumed.id, input.clientMessageId), { status: 'refused', reason: 'Fixture refusal' })
    assert.deepEqual(await client.submitMessage(resumed.id, input), { accepted: false, reason: 'Fixture refusal' })
    await rejectsCode(client.submitMessage(resumed.id, { ...input, placement: 'followup' }), 'message_id_conflict')
    assert.equal(await count(root), 1)
    const response = await fetch(`${baseUrl}/v1/sessions/${resumed.id}/messages/missing`)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    await rejectsCode(client.messageDelivery(resumed.id, 'x'.repeat(513)), 'invalid_message_id')
  })

  test('untracked legacy sessions and memory-only resumed sessions never assert absence', { timeout: 15000 }, async t => {
    const root = await temporary(t)
    for (const durable of [true, false]) {
      const { server, client } = await serve(root, durable ? {} : { messageDeliveryDirectory: undefined })
      try {
        const legacy = await open(client, root, 'legacy')
        assert.deepEqual(await client.messageDelivery(legacy.id, 'unknown'), { status: 'unconfirmed' })
        await client.submitMessage(legacy.id, { clientMessageId: 'known', text: 'local' })
        assert.deepEqual(await client.messageDelivery(legacy.id, 'known'), { status: 'accepted' })
        await client.disposeSession(legacy.id)
        const fresh = await open(client, root)
        assert.deepEqual(await client.messageDelivery(fresh.id, 'unknown'), { status: 'not_received' })
      } finally { await server.close() }
    }
  })

  test('exclusive durable admission fences independent writers; corrupt storage fails closed', { timeout: 15000 }, async t => {
    const root = await temporary(t)
    const session = { ref: { backendId: 'local', sessionId: 'race' }, cwd: root }
    const left = messageDeliveryStore(root, session)
    const right = messageDeliveryStore(root, session)
    await left.initialize()
    const entry = { fingerprint: 'a'.repeat(64) }
    const admissions = await Promise.all([left.admit('../same/id', entry), right.admit('../same/id', entry)])
    assert.equal(admissions.filter(Boolean).length, 1)
    assert.deepEqual(await right.get('../same/id'), entry)
    const other = messageDeliveryStore(root, { ...session, cwd: join(root, 'other') })
    assert.equal(await other.get('../same/id'), undefined)
    const [directory] = await readdir(root)
    const record = (await readdir(join(root, directory))).find(name => name.endsWith('.json'))
    await writeFile(join(root, directory, record), '{')
    await assert.rejects(left.get('../same/id'))
    assert.equal(await right.admit('../same/id', entry), false)
    const unavailable = join(root, 'file-not-directory')
    await writeFile(unavailable, 'blocked')
    await assert.rejects(messageDeliveryStore(unavailable, session).admit('new', entry))
  })

  test('concurrent HTTP sends execute once and attachment changes conflict with the original ID', { timeout: 15000 }, async t => {
    const root = await temporary(t)
    const { server, client } = await serve(root, { contextManager: { prepare: async (_session, input) => input } })
    t.after(() => server.close())
    const session = await open(client, root)
    const input = { clientMessageId: 'concurrent', text: 'local QAOA' }
    const attempts = await Promise.allSettled([client.submitMessage(session.id, input), client.submitMessage(session.id, input)])
    assert.ok(attempts.some(result => result.status === 'fulfilled' && result.value.accepted))
    for (const result of attempts) {
      if (result.status === 'rejected') assert.equal(result.reason.code, 'input_preparation_in_progress')
    }
    assert.equal(await count(root), 1)
    await rejectsCode(client.submitMessage(session.id, { ...input,
      images: [{ name: 'circuit.png', mediaType: 'image/png', data: 'YQ==' }],
    }), 'message_id_conflict')
    assert.equal(await count(root), 1)
  })

  test('unavailable storage blocks backend dispatch and does not claim non-delivery', { timeout: 15000 }, async t => {
    const root = await temporary(t)
    const unavailable = join(root, 'blocked')
    await writeFile(unavailable, 'file')
    const { server, client } = await serve(root, { messageDeliveryDirectory: unavailable })
    t.after(() => server.close())
    await assert.rejects(open(client, root))
    const legacy = await open(client, root, 'legacy')
    await assert.rejects(client.messageDelivery(legacy.id, 'missing'))
    await assert.rejects(client.submitMessage(legacy.id, { clientMessageId: 'new', text: 'local' }))
    assert.equal(await count(root), 0)
  })
}
