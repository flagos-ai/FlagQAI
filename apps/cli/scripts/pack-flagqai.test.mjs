import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertNoOrphanedCompiledSources, includeBundledEntry } from './pack-flagqai.mjs'

test('copies bundled source but excludes nested installs on POSIX and Windows', () => {
  for (const root of [
    '/checkout/node_modules/@dsh-std/core',
    'C:\\checkout\\node_modules\\@dsh-std\\core',
  ]) {
    const separator = root.includes('\\') ? '\\' : '/'
    assert.equal(includeBundledEntry(root, root), true)
    assert.equal(includeBundledEntry(root, `${root}${separator}lib${separator}index.js`), true)
    assert.equal(includeBundledEntry(root, `${root}${separator}node_modules-copy${separator}index.js`), true)
    assert.equal(includeBundledEntry(root, `${root}${separator}node_modules`), false)
    assert.equal(includeBundledEntry(root, `${root}${separator}node_modules${separator}extra${separator}index.js`), false)
    assert.equal(includeBundledEntry(root, `${root}${separator}lib${separator}node_modules${separator}extra.js`), false)
    assert.equal(includeBundledEntry(root, `${root}-other${separator}index.js`), false)
  }
})

test('refuses deleted source modules left in the compiled package tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flagqai-compiled-source-'))
  try {
    await Promise.all(['src/components', 'lib/types/components'].map(path => mkdir(join(root, path), { recursive: true })))
    await writeFile(join(root, 'src/components/Current.tsx'), 'export const Current = true\n')
    await writeFile(join(root, 'lib/types/components/Current.js'), 'export const Current = true\n')
    await assertNoOrphanedCompiledSources(root)
    await writeFile(join(root, 'lib/types/components/Removed.js'), 'export const Removed = true\n')
    await assert.rejects(assertNoOrphanedCompiledSources(root), /Stale compiled CLI module: lib\/types\/components\/Removed\.js/u)
    await rm(join(root, 'lib/types/components/Removed.js'))
    await writeFile(join(root, 'lib/types/components/Removed.d.ts.map'), '{}\n')
    await assert.rejects(assertNoOrphanedCompiledSources(root), /Stale compiled CLI module: lib\/types\/components\/Removed\.d\.ts\.map/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
