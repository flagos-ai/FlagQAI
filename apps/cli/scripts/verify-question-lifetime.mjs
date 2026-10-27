/** Cancelled questions stay absent; settled asks release their signal listeners. */
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = realpathSync(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url)))
const base = join(root, process.argv[2] === undefined ? 'src' : 'lib/types')
const { QuestionStore } = await import(pathToFileURL(join(base, 'channel/questions.js')).href)
const request = signal => ({ signal, questions: [{ id: 'q', question: 'Synthetic secret?', secret: true, options: [] }] })
const listeners = signal => getEventListeners(signal, 'abort').length
const expectCode = (promise, code) => assert.rejects(promise, error => error.code === code)
const store = new QuestionStore()
const aborted = new AbortController(); aborted.abort()
await expectCode(store.ask(request(aborted.signal)), 'ASK_ABORTED')
assert.equal(store.getSnapshot(), null)
assert.equal(listeners(aborted.signal), 0)
const shared = new AbortController()
for (let index = 0; index < 100; index++) {
  const answer = store.ask(request(shared.signal))
  assert.equal(listeners(shared.signal), 1)
  store.answerCurrent({ selected: [], custom: 'synthetic answer' })
  assert.equal((await answer).answers[0].custom, 'synthetic answer')
  assert.equal(listeners(shared.signal), 0, 'completed answers must not remain reachable from the signal')
}
const active = store.ask(request(shared.signal))
const key = store.getSnapshot().key
await expectCode(store.ask(request(aborted.signal)), 'ASK_ABORTED')
assert.equal(store.getSnapshot().key, key, 'an already-aborted queued ask must not replace the live question')
assert.equal(store.pendingViews().length, 1)
const cancelled = expectCode(active, 'ASK_CANCELLED')
store.cancelCurrent(); await cancelled
assert.equal(listeners(shared.signal), 0)
const first = store.ask(request(shared.signal)), second = store.ask(request(shared.signal))
const rejected = Promise.all([expectCode(first, 'ASK_ABORTED'), expectCode(second, 'ASK_ABORTED')])
assert.equal(listeners(shared.signal), 2)
store.rejectAll(); await rejected
assert.equal(listeners(shared.signal), 0)
assert.equal(store.getSnapshot(), null)
const another = new AbortController()
const live = store.ask(request(shared.signal)), queued = store.ask(request(another.signal))
const interrupted = expectCode(queued, 'ASK_ABORTED')
another.abort(); await interrupted
assert.equal(store.pendingViews().length, 1)
assert.equal(listeners(another.signal), 0)
const liveCancelled = expectCode(live, 'ASK_CANCELLED')
store.cancelRequest(store.pendingViews()[0].requestId); await liveCancelled
assert.equal(listeners(shared.signal), 0)
const complete = store.ask(request(shared.signal))
store.respond(store.pendingViews()[0].requestId, { answers: [{ selected: [], custom: 'public response path' }] })
await complete
assert.equal(listeners(shared.signal), 0)
shared.abort()
assert.equal(store.getSnapshot(), null)
console.log('PASS question lifetime: pre-abort, 100 settled asks, queued abort, user cancel, rejectAll and request APIs release listeners')
