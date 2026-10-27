/** The first-release picker exposes the Harness runtime only. */
import assert from 'node:assert/strict'
import { buildKernelCatalog, kernelDisplayName, kernelSubtitle } from '../src/components/kernelCatalog.js'
import { isKernelId, KERNEL_IDS, KERNEL_INFO, resolveRememberedBackend } from '../src/kernelPrefs.js'
import { normalizeBackendChoice } from '../src/dsh-adapter/index.js'

assert.deepEqual(KERNEL_IDS, ['dsh'])
assert.equal(isKernelId('claude'), false)
assert.equal(isKernelId('codex'), false)
assert.throws(() => normalizeBackendChoice(' Claude '), /deferred from the first CLI release/u)
assert.throws(() => normalizeBackendChoice(' Codex '), /deferred from the first CLI release/u)
assert.throws(() => resolveRememberedBackend({ envRaw: 'claude' }), /deferred from the first CLI release/u)
assert.throws(() => resolveRememberedBackend({ envRaw: 'codex' }), /deferred from the first CLI release/u)
assert.equal(KERNEL_INFO.dsh.product, 'dsh-core')
assert.equal(kernelDisplayName('dsh'), 'DSH')

for (const statuses of [undefined, { claude: { installed: true }, codex: { installed: true } }]) {
  const options = buildKernelCatalog({ current: 'dsh', dshVersion: '0.2.1', ...(statuses === undefined ? {} : { statuses }) })
  assert.equal(options.length, 1)
  assert.equal(options[0]!.id, 'dsh')
  assert.equal(options[0]!.selectable, true)
  assert.equal(options[0]!.current, true)
  assert.equal(kernelSubtitle(options[0]!, key => key), 'dsh-core v0.2.1')
}

console.log('verify-kernel-catalog OK (Harness-only picker and stale backend inputs)')
