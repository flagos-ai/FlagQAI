import assert from 'node:assert/strict'
import test from 'node:test'
import { candidateStatus } from './provenance-candidate-status.mjs'

const manifest = {
  importCommit: 'pinned', expectedHistoricalCcPortCount: 4,
  upstreamAuditExclusions: ['compat-only'],
  entries: ['same', 'changed', 'moved', 'gone', 'compat-only']
    .map(path => ({ path, markers: ['explicit_source_claim'] })),
}
const importTree = {
  sha: 'pinned', truncated: false,
  tree: ['same', 'changed', 'moved', 'gone'].map(path => ({ path, type: 'blob', sha: `import-${path}` })),
}

test('historical source status does not treat edits, moves, or deletion as rights clearance', () => {
  const report = candidateStatus(manifest, importTree, [
    ['same', 'import-same'], ['changed', 'new-blob'], ['elsewhere', 'import-moved'],
  ])
  assert.deepEqual(report.counts, {
    identical_import: 1, modified_same_path: 1,
    relocated_identical_import: 1, absent_at_old_path: 1,
  })
  assert.equal(report.rows.find(row => row.path === 'moved')?.relocatedPaths[0], 'elsewhere')
  assert.ok(!report.rows.some(row => row.path === 'compat-only'))
  assert.match(report.rightsVerdict, /unresolved/u)
})

test('a truncated or wrong pinned tree cannot become a release inventory', () => {
  assert.throws(() => candidateStatus(manifest, { ...importTree, truncated: true }, []), /complete/u)
  assert.throws(() => candidateStatus(manifest, { ...importTree, sha: 'other' }, []), /pinned/u)
  assert.throws(() => candidateStatus(manifest, importTree, [['same', 'one'], ['same', 'two']]), /duplicate/u)
})
