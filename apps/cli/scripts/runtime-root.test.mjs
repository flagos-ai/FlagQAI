import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { resolveRuntimeRoot } from '../bin/runtime-root.js'

test('canonicalizes the existing ancestor before a Windows runtime is created', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'flagqai-runtime-root-'))
  try {
    const alias = join(sandbox, 'alias')
    symlinkSync(sandbox, alias, process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(resolveRuntimeRoot(join(alias, 'new', 'runtime'), 'win32'),
      join(realpathSync.native(sandbox), 'new', 'runtime'))
    assert.equal(resolveRuntimeRoot(alias, 'win32'), realpathSync.native(sandbox))
    assert.equal(resolveRuntimeRoot(alias, 'linux'), resolve(alias))
  } finally { rmSync(sandbox, { recursive: true, force: true }) }
})

test('does not hide filesystem failures while resolving the runtime root', () => {
  const denied = Object.assign(new Error('access denied'), { code: 'EACCES' })
  assert.throws(() => resolveRuntimeRoot('runtime', 'win32', () => { throw denied }), error => error === denied)
})
