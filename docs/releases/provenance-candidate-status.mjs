#!/usr/bin/env node
/** Track historical upstream markers against a specific current CLI Git tree.
 * Blob continuity is evidence of lineage, never a redistribution verdict. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

export function candidateStatus(manifest, importTree, currentRows) {
  assert.equal(importTree.sha, manifest.importCommit, 'unexpected pinned import commit')
  assert.equal(importTree.truncated, false, 'pinned import tree must be complete')
  assert.ok(Array.isArray(importTree.tree), 'pinned import tree is missing entries')
  const excluded = new Set(manifest.upstreamAuditExclusions)
  const candidates = manifest.entries.filter(entry => !excluded.has(entry.path))
  assert.equal(candidates.length, manifest.expectedHistoricalCcPortCount,
    'historical candidate count changed without a manifest review')
  assert.equal(new Set(candidates.map(entry => entry.path)).size, candidates.length,
    'duplicate historical candidate path')
  const imported = new Map(importTree.tree.filter(row => row.type === 'blob').map(row => [row.path, row.sha]))
  const current = new Map(currentRows)
  assert.equal(current.size, currentRows.length, 'duplicate current CLI path')
  const byBlob = new Map()
  for (const [path, sha] of current) {
    const paths = byBlob.get(sha) ?? []
    paths.push(path)
    byBlob.set(sha, paths)
  }
  const rows = candidates.map(entry => {
    const importBlob = imported.get(entry.path) ?? null
    const currentBlob = current.get(entry.path) ?? null
    const relocatedPaths = currentBlob === null && importBlob !== null
      ? (byBlob.get(importBlob) ?? []) : []
    const state = currentBlob !== null
      ? importBlob === currentBlob ? 'identical_import' : 'modified_same_path'
      : relocatedPaths.length > 0 ? 'relocated_identical_import' : 'absent_at_old_path'
    return { path: entry.path, markers: entry.markers, importBlob, currentBlob, state, relocatedPaths }
  })
  const counts = Object.fromEntries(
    ['identical_import', 'modified_same_path', 'relocated_identical_import', 'absent_at_old_path']
      .map(state => [state, rows.filter(row => row.state === state).length]),
  )
  return { count: rows.length, counts, rows,
    rightsVerdict: 'unresolved: file changes and old-path absence are not clearance' }
}

export function currentCliRows(ref = 'HEAD') {
  const output = execFileSync('git', ['ls-tree', '-rz', ref, '--', 'apps/cli'], { cwd: root })
  return output.toString('utf8').split('\0').filter(Boolean).map(raw => {
    const tab = raw.indexOf('\t')
    assert.ok(tab > 0, `invalid Git tree row: ${raw}`)
    const [mode, type, sha] = raw.slice(0, tab).split(' ')
    assert.equal(type, 'blob', `unexpected Git tree entry: ${raw}`)
    assert.ok(mode === '100644' || mode === '100755', `unexpected Git file mode: ${raw}`)
    return [raw.slice(tab + 1).replace(/^apps\/cli\//u, ''), sha]
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [treePath, ...options] = process.argv.slice(2)
  if (!treePath || options.some(option => option !== '--json')) {
    console.error('Usage: node docs/releases/provenance-candidate-status.mjs <pinned-import-tree.json> [--json]')
    process.exit(2)
  }
  const manifest = JSON.parse(readFileSync(new URL('./upstream-provenance-markers.json', import.meta.url), 'utf8'))
  const importTree = JSON.parse(readFileSync(treePath, 'utf8'))
  const report = candidateStatus(manifest, importTree, currentCliRows())
  const result = { currentCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    importCommit: manifest.importCommit, ...report }
  if (options.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`Historical candidates: ${report.count}`)
    for (const [state, count] of Object.entries(report.counts)) console.log(`${state}: ${count}`)
    console.log(report.rightsVerdict)
  }
}
