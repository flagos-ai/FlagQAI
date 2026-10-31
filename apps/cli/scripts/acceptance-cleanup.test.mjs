import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { removeAcceptanceSandbox } from './acceptance-cleanup.mjs'

test('removes an isolated sandbox, including paths containing spaces', async () => {
  const path = await mkdtemp(join(tmpdir(), 'flagqai cleanup '))
  await writeFile(join(path, 'probe.txt'), 'acceptance')
  assert.equal(removeAcceptanceSandbox(path, { log() {} }), true)
  await assert.rejects(access(path), { code: 'ENOENT' })
})

test('terminates stuck cleanup without replacing the acceptance outcome', async () => {
  const path = await mkdtemp(join(tmpdir(), 'flagqai-cleanup-timeout-'))
  const warnings = []
  try {
    const start = Date.now()
    const removed = removeAcceptanceSandbox(path, {
      timeout: 200,
      run(command, _args, options) {
        return spawnSync(command, ['-e', 'setInterval(() => {}, 1000)'], options)
      },
      warn(message) { warnings.push(message) },
      log() { assert.fail('timed-out cleanup must not report success') },
    })
    assert.equal(removed, false)
    assert.match(warnings.join('\n'), /ETIMEDOUT.*leaving it for runner cleanup/)
    assert.ok(Date.now() - start < 10000, 'cleanup must have a finite deadline')
    await access(path)
  } finally {
    await rm(path, { recursive: true, force: true })
  }
})
