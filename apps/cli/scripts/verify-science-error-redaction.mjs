/** Worker diagnostics must redact complete environment values before truncation. */
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
const modulePath = process.argv[2] === undefined
  ? fileURLToPath(new URL('../../../packages/scientific-core/execution/local-json-process.mjs', import.meta.url))
  : join(process.argv[2], 'lib/flagqai-platform/scientific-core/execution/local-json-process.mjs')
const { runLocalJsonProcess } = await import(pathToFileURL(modulePath).href)
const token = 'SYNTHETIC-CREDENTIAL-FOR-BOUNDARY-ONLY'
const failure = async (prefix, suffix = '') => {
  let failure
  try {
    await runLocalJsonProcess({
      command: process.execPath,
      args: ['-e', `process.stdin.resume(); process.stdin.on('end', () => { process.stderr.write(${JSON.stringify(prefix)} + process.env.FIXTURE_TOKEN + ${JSON.stringify(suffix)}); process.exitCode = 1 })`],
      cwd: process.cwd(), env: { FIXTURE_TOKEN: token }, input: {},
      timeoutMs: 5000, maxOutputBytes: 16384,
      label: 'synthetic science error', notFoundMessage: 'Node fixture missing',
    })
  } catch (error) { failure = error }
  assert.ok(failure instanceof Error)
  return failure.message
}
assert.equal(await failure('diagnostic: ', ' / ordinary tail'), 'diagnostic: [REDACTED] / ordinary tail')
for (const offset of [1980, 1990, 1999, 2000, 2001]) {
  const prefix = 'x'.repeat(offset)
  const message = await failure(prefix)
  assert.equal(message, (prefix + '[REDACTED]').slice(0, 2000), `redact before truncating at offset ${offset}`)
  assert.ok(!message.includes('SYNTHETIC'), 'credential prefix must never appear')
  assert.ok(message.length <= 2000)
}
assert.equal(await failure('', token), '[REDACTED][REDACTED]')
console.log('PASS science error redaction: complete secrets, repeated values, five truncation boundaries, readable diagnostics and 2000-character limit')
