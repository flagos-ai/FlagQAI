#!/usr/bin/env node
// Verify the pinned public dsh-std tree and the vendored tracked source boundary.
// This establishes direct source/notice continuity, not rights to other imports.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const vendor = 'apps/cli/vendor/dsh-std/'
const manifestPath = process.argv[2] ?? join(root, 'docs/releases/dsh-std-upstream-blobs.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.equal(manifest.schema, 'flagqai.dsh_std_vendor_lineage.v1')
assert.equal(manifest.upstreamRepository, 'T-Auto/dsh-std')
assert.equal(manifest.upstreamCommit, '614dfa1ac168db79fcf4577cf0ebb34e2e3b944b')
assert.equal(manifest.upstreamTree, '8a84be12576128a3e5405a72607b9318dd85d775')

function objectId(type, content) {
  return createHash('sha1').update(Buffer.from(`${type} ${content.length}\0`)).update(content).digest('hex')
}

function treeId(blobs) {
  const top = new Map()
  for (const [path, oid] of Object.entries(blobs)) {
    assert.match(path, /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[^\0]+$/u)
    assert.match(oid, /^[0-9a-f]{40}$/u)
    const pieces = path.split('/')
    let directory = top
    for (const name of pieces.slice(0, -1)) {
      const existing = directory.get(name)
      assert.ok(existing === undefined || existing instanceof Map, `file/directory collision: ${path}`)
      if (!existing) directory.set(name, new Map())
      directory = directory.get(name)
    }
    assert.ok(!directory.has(pieces.at(-1)), `duplicate upstream path: ${path}`)
    directory.set(pieces.at(-1), oid)
  }
  const hashDirectory = directory => {
    const entries = [...directory.entries()].sort(([a, av], [b, bv]) =>
      Buffer.compare(Buffer.from(a + (av instanceof Map ? '/' : '')),
        Buffer.from(b + (bv instanceof Map ? '/' : ''))))
    const content = Buffer.concat(entries.flatMap(([name, value]) => {
      const isTree = value instanceof Map
      return [Buffer.from(`${isTree ? '40000' : '100644'} ${name}\0`),
        Buffer.from(isTree ? hashDirectory(value) : value, 'hex')]
    }))
    return objectId('tree', content)
  }
  return hashDirectory(top)
}

assert.equal(treeId(manifest.blobs), manifest.upstreamTree,
  'upstream blob inventory does not reconstruct the pinned Git tree')
assert.equal(Object.keys(manifest.blobs).length, 209, 'pinned upstream file count changed')

const tracked = new Map()
for (const row of execFileSync('git', ['ls-files', '--stage', '-z', '--', vendor], { cwd: root }).toString('utf8').split('\0').filter(Boolean)) {
  const [metadata, path] = row.split('\t')
  const [mode, oid, stage] = metadata.split(' ')
  assert.equal(stage, '0', `unmerged vendored file: ${path}`)
  assert.ok(path.startsWith(vendor))
  assert.ok(!tracked.has(path.slice(vendor.length)), `duplicate vendored path: ${path}`)
  tracked.set(path.slice(vendor.length), { mode, oid })
}
assert.equal(tracked.size, Object.keys(manifest.blobs).length, 'vendored file count differs from pinned upstream')

const upstream = new Map(Object.entries(manifest.blobs))
const differences = manifest.localDifferences
assert.deepEqual(Object.keys(differences).sort(), [
  'package.json', 'packages/command/tsdown.config.ts',
  'packages/namespace-guard/README.zh.md', 'packages/tool/tsdown.config.ts',
].sort(), 'local difference allowlist changed')
let exact = 0
for (const [path, local] of tracked) {
  const reference = upstream.get(path)
  assert.ok(reference, `vendored path absent upstream: ${path}`)
  assert.equal(local.mode, '100644', `vendored mode differs: ${path}`)
  const bytes = readFileSync(join(root, vendor, path))
  assert.equal(objectId('blob', bytes), local.oid, `working file differs from Git index: ${path}`)
  const allowed = differences[path]
  assert.equal(local.oid, allowed?.localOid ?? reference, `unreviewed vendored drift: ${path}`)
  if (allowed) {
    assert.notEqual(allowed.localOid, reference, `obsolete difference allowance: ${path}`)
    assert.ok(typeof allowed.reason === 'string' && allowed.reason.length > 10)
  } else exact++
}
const licenses = Object.entries(manifest.blobs).filter(([path]) => path === 'LICENSE' || path.endsWith('/LICENSE'))
assert.equal(licenses.length, 16, 'pinned license inventory changed')
assert.ok(licenses.every(([path]) => !differences[path]), 'a license text differs from the pinned upstream')
assert.ok(licenses.every(([, oid]) => oid === '137155e79cede6cde5debea69b83b9ab13ed3722'),
  'the pinned packages no longer share the reviewed MIT license')
assert.match(readFileSync(join(root, vendor, 'LICENSE'), 'utf8'), /^MIT License\n\nCopyright \(c\) 2026 DSH Standard contributors/u)
console.log(`PASS pinned dsh-std vendor lineage (${exact}/${tracked.size} exact blobs, ${Object.keys(differences).length} reviewed local differences, ${licenses.length} exact license files)`)
