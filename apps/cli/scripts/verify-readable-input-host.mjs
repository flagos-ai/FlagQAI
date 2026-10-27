#!/usr/bin/env node
import assert from 'node:assert/strict'
import { PassThrough, Writable } from 'node:stream'
import App from '../lib/types/ink/components/App.js'

function fixture() {
  const stdin = new PassThrough()
  stdin.isTTY = true
  stdin.setRawMode = () => stdin
  stdin.ref = () => stdin
  stdin.unref = () => stdin
  const stdout = new Writable({ write(_chunk, _encoding, done) { done() } })
  stdout.isTTY = true
  let resumes = 0
  const app = new App({ stdin, stdout, stderr: stdout, children: null,
    onExit() {}, onStdinResume() { resumes++ } })
  return { app, stdin, resumes: () => resumes }
}

function queueReads(stdin, chunks) {
  const remaining = [...chunks, null]
  stdin.read = () => remaining.shift() ?? null
}

{
  const { app, stdin, resumes } = fixture()
  const chunks = []
  app.processInput = chunk => chunks.push(String(chunk))
  queueReads(stdin, [Buffer.from('a'), Buffer.from('b')])
  app.lastStdinTime = Date.now() - 1000
  app.handleReadable()
  assert.deepEqual(chunks, ['a', 'b'], 'one notification drains every available chunk')
  assert.equal(resumes(), 0, 'ordinary input must not emit a resume notification')
  app.querier.dispose?.()
}

{
  const { app, stdin, resumes } = fixture()
  queueReads(stdin, [])
  app.lastStdinTime = Date.now() - 6000
  app.handleReadable()
  assert.equal(resumes(), 1, 'even an empty notification detects resumed stdin')
  assert.ok(app.lastStdinTime > 0, 'the activity timestamp advances')
  app.querier.dispose?.()
}

{
  const { app, stdin } = fixture()
  app.rawModeEnabledCount = 1
  queueReads(stdin, [Buffer.from('bad')])
  app.processInput = () => { throw new Error('fixture parser failure') }
  const originalStderr = process.stderr.write
  process.stderr.write = () => true
  try {
    assert.doesNotThrow(() => app.handleReadable())
  } finally {
    process.stderr.write = originalStderr
  }
  assert.equal(stdin.listenerCount('readable'), 1,
    'an active raw-mode owner recovers a missing listener after an input error')
  app.querier.dispose?.()
}

console.log('verify-readable-input-host OK')
