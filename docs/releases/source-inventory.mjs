#!/usr/bin/env node
/** Compare the current CLI Git tree with the pinned dsh-TUI import tree. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const upstreamCommit = 'c2eee95218d1decfce138f7d31ef7099cc391d00'
const path = process.argv[2]
if (!path || process.argv.slice(3).some(arg => arg !== '--paths')) {
  console.error('Usage: node docs/releases/source-inventory.mjs <GitHub recursive-tree JSON> [--paths]')
  process.exit(2)
}
const upstreamTree = JSON.parse(readFileSync(path, 'utf8'))
assert.equal(upstreamTree.sha, upstreamCommit, 'unexpected upstream commit')
assert.equal(upstreamTree.truncated, false, 'upstream tree must be complete')
const upstream = new Map()
const byBlob = new Map()
for (const entry of upstreamTree.tree) {
  if (entry.type !== 'blob') continue
  assert.ok(!upstream.has(entry.path), `duplicate upstream path: ${entry.path}`)
  upstream.set(entry.path, entry.sha)
  const paths = byBlob.get(entry.sha) ?? []
  paths.push(entry.path)
  byBlob.set(entry.sha, paths)
}

const root = new URL('../../', import.meta.url)
const records = execFileSync('git', ['ls-tree', '-rz', 'HEAD', '--', 'apps/cli'], { cwd: root })
const groups = { samePath: [], modifiedPath: [], relocatedExact: [], vendoredDshStd: [], newPath: [] }
for (const raw of records.toString('utf8').split('\0')) {
  if (!raw) continue
  const tab = raw.indexOf('\t')
  assert.ok(tab > 0, 'invalid git ls-tree record')
  const [mode, type, sha] = raw.slice(0, tab).split(' ')
  assert.equal(type, 'blob', `unexpected CLI tree entry type: ${raw}`)
  assert.ok(mode === '100644' || mode === '100755', `unexpected CLI file mode: ${raw}`)
  const localPath = raw.slice(tab + 1).replace(/^apps\/cli\//u, '')
  if (localPath.startsWith('vendor/dsh-std/')) {
    groups.vendoredDshStd.push(localPath)
  } else if (upstream.get(localPath) === sha) {
    groups.samePath.push(localPath)
  } else if (upstream.has(localPath)) {
    groups.modifiedPath.push(localPath)
  } else if (byBlob.has(sha)) {
    groups.relocatedExact.push({ local: localPath, upstream: byBlob.get(sha) })
  } else {
    groups.newPath.push(localPath)
  }
}
const counts = Object.fromEntries(Object.entries(groups).map(([name, paths]) => [name, paths.length]))
assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0),
  records.toString('utf8').split('\0').filter(Boolean).length)
const result = {
  currentCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  upstreamCommit,
  upstreamBlobs: upstream.size,
  cliBlobs: Object.values(counts).reduce((sum, count) => sum + count, 0),
  counts,
  ...(process.argv.includes('--paths') ? { paths: groups } : {}),
}
console.log(JSON.stringify(result, null, 2))
