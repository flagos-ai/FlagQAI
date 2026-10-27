#!/usr/bin/env node
/** Compare pinned historical provenance-marker paths with the current CLI tree. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [baselineFile, importFile, ...options] = process.argv.slice(2)
if (!baselineFile || !importFile || options.some(option => option !== '--paths')) {
  console.error('Usage: node docs/releases/provenance-marker-inventory.mjs <baseline-tree.json> <import-tree.json> [--paths]')
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(new URL('./upstream-provenance-markers.json', import.meta.url), 'utf8'))
function treeAt(file, expectedCommit) {
  const tree = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(tree.sha, expectedCommit, 'unexpected upstream Git tree')
  assert.equal(tree.truncated, false, 'upstream Git tree must be complete')
  return new Map(tree.tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, entry.sha]))
}
const baseline = treeAt(baselineFile, manifest.baselineCommit)
const imported = treeAt(importFile, manifest.importCommit)

const root = new URL('../../', import.meta.url)
const raw = execFileSync('git', ['ls-tree', '-rz', 'HEAD', '--', 'apps/cli'], { cwd: root })
const current = new Map()
for (const record of raw.toString('utf8').split('\0')) {
  if (!record) continue
  const separator = record.indexOf('\t')
  assert.ok(separator > 0, `malformed local Git tree record: ${record}`)
  const metadata = record.slice(0, separator)
  const path = record.slice(separator + 1)
  assert.ok(path?.startsWith('apps/cli/'), `unexpected local Git tree record: ${record}`)
  const [mode, type, blob] = metadata.split(' ')
  assert.ok(mode === '100644' || mode === '100755', `unexpected file mode: ${record}`)
  assert.equal(type, 'blob', `unexpected Git tree entry: ${record}`)
  current.set(path.slice('apps/cli/'.length), blob)
}

const seen = new Set()
const auditExclusions = new Set(manifest.upstreamAuditExclusions)
assert.equal(auditExclusions.size, manifest.upstreamAuditExclusions.length, 'duplicate upstream audit exclusion')
const results = []
const markerCounts = {}
for (const entry of manifest.entries) {
  assert.ok(!seen.has(entry.path), `duplicate manifest path: ${entry.path}`)
  seen.add(entry.path)
  assert.equal(baseline.get(entry.path), entry.baselineBlob, `historical marker blob changed: ${entry.path}`)
  for (const marker of entry.markers) markerCounts[marker] = (markerCounts[marker] ?? 0) + 1
  const importBlob = imported.get(entry.path)
  const currentBlob = current.get(entry.path)
  const status = importBlob === undefined ? 'absentAtImportSamePath'
    : currentBlob === undefined ? 'absentAtCurrentSamePath'
      : currentBlob === importBlob ? 'sameAsImport' : 'changedSinceImport'
  results.push({
    path: entry.path,
    markers: entry.markers,
    reconstructedBucket: auditExclusions.has(entry.path) ? 'excluded' : 'cc-port',
    status,
    importBlob,
    currentBlob,
  })
}
for (const path of auditExclusions) assert.ok(seen.has(path), `unknown upstream audit exclusion: ${path}`)
const upstreamAuditResults = results.filter(result => result.reconstructedBucket === 'cc-port')
assert.equal(upstreamAuditResults.length, manifest.expectedHistoricalCcPortCount, 'historical cc-port count differs from upstream audit')

const statusNames = ['sameAsImport', 'changedSinceImport', 'absentAtCurrentSamePath', 'absentAtImportSamePath']
const countsByStatus = entries => Object.fromEntries(
  statusNames.map(status => [status, entries.filter(result => result.status === status).length]),
)
console.log(JSON.stringify({
  currentCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  baselineCommit: manifest.baselineCommit,
  importCommit: manifest.importCommit,
  screenedPaths: results.length,
  reconstructedCcPortPaths: upstreamAuditResults.length,
  upstreamAuditExclusions: [...auditExclusions],
  markerCounts,
  statuses: countsByStatus(results),
  reconstructedCcPortStatuses: countsByStatus(upstreamAuditResults),
  note: 'Upstream self-classification and same-path continuity only; changed or absent paths are not cleared.',
  ...(options.includes('--paths') ? { paths: results } : {}),
}, null, 2))
