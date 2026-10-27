#!/usr/bin/env node
import assert from 'node:assert/strict'
import { PassThrough, Writable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import App from '../lib/types/ink/components/App.js'

function checkLease(extraEnableWrites) {
  const calls = []
  const stdin = new PassThrough()
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setEncoding = value => { calls.push(`encoding:${value}`); return stdin }
  stdin.ref = () => { calls.push('ref'); return stdin }
  stdin.unref = () => { calls.push('unref'); return stdin }
  stdin.setRawMode = value => { calls.push(`raw:${value}`); stdin.isRaw = value; return stdin }
  const stdout = new Writable({ write(chunk, _encoding, done) {
    calls.push(`write:${JSON.stringify(String(chunk))}`)
    done()
  } })
  stdout.isTTY = true
  const app = new App({ stdin, stdout, stderr: stdout, onExit() {}, children: null })

  try {
    app.handleSetRawMode(false)
    assert.equal(app.rawModeEnabledCount, 0, 'an unmatched release must not underflow')
    calls.length = 0
    app.handleSetRawMode(true)
    app.handleSetRawMode(true)
    assert.equal(stdin.listenerCount('readable'), 1, 'one readable listener owns stdin')
    app.handleSetRawMode(false)
    assert.equal(stdin.isRaw, true, 'the second lease keeps raw mode active')
    app.handleSetRawMode(false)
    assert.equal(stdin.listenerCount('readable'), 0, 'the final release detaches stdin')
    assert.equal(app.rawModeEnabledCount, 0)
    assert.deepEqual(calls, [
      'encoding:utf8', 'ref', 'raw:true',
      'write:"\\u001b[?2004h"', 'write:"\\u001b[?1004h"',
      ...extraEnableWrites,
      'encoding:utf8', 'encoding:utf8', 'encoding:utf8',
      'write:"\\u001b[>4m"', 'write:"\\u001b[<u"',
      'write:"\\u001b[?9001l"', 'write:"\\u001b[?1004l"',
      'write:"\\u001b[?2004l"', 'raw:false', 'unref',
    ])
    stdin.isTTY = false
    assert.throws(() => app.handleSetRawMode(true), /Raw mode is not supported/)
    assert.equal(app.rawModeEnabledCount, 0, 'a rejected request must not acquire stdin')
  } finally {
    app.querier.dispose?.()
  }
}

if (process.argv[2] === 'child') {
  checkLease(process.env.TERM_PROGRAM === 'kitty'
    ? ['write:"\\u001b[>1u"', 'write:"\\u001b[>4;2m"']
    : [])
} else {
  for (const termProgram of ['xterm', 'kitty']) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'child'], {
      env: { ...process.env, TERM_PROGRAM: termProgram }, encoding: 'utf8',
    })
    assert.equal(child.status, 0, `${termProgram}: ${child.stderr}`)
  }
  console.log('verify-raw-mode-lease OK')
}
