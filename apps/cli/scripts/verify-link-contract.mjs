import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./link-contract-case.tsx', import.meta.url))
for (const [flag, mode] of [['1', 'enabled'], ['0', 'disabled']]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', fixture, mode], {
    env: { ...process.env, FORCE_HYPERLINK: flag },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  process.stdout.write(result.stdout)
}
