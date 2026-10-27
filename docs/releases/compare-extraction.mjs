#!/usr/bin/env node
/** Classify current source paths against the pinned FlagQAI extraction tree. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const originCommit = '02a4d24e0dda0e9b8b28b7a1a1a826538538ee8f'
const [inventoryPath, originPath] = process.argv.slice(2)
if (!inventoryPath || !originPath || process.argv.length !== 4) {
  console.error('Usage: node docs/releases/compare-extraction.mjs <source-inventory JSON with --paths> <FlagQAI recursive-tree JSON>')
  process.exit(2)
}

const root = new URL('../../', import.meta.url)
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
const originTree = JSON.parse(readFileSync(originPath, 'utf8'))
assert.equal(inventory.currentCommit, head, 'source inventory must describe current HEAD')
assert.equal(originTree.sha, originCommit, 'unexpected FlagQAI extraction commit')
assert.equal(originTree.truncated, false, 'FlagQAI extraction tree must be complete')
assert.ok(Array.isArray(inventory.paths?.newPath), 'source inventory must include --paths')

const origin = new Map()
for (const entry of originTree.tree) {
  if (entry.type !== 'blob') continue
  assert.ok(!origin.has(entry.path), `duplicate extraction path: ${entry.path}`)
  origin.set(entry.path, entry.sha)
}

const current = new Map()
const records = execFileSync('git', ['ls-tree', '-rz', 'HEAD'], { cwd: root }).toString('utf8')
for (const raw of records.split('\0')) {
  if (!raw) continue
  const tab = raw.indexOf('\t')
  assert.ok(tab > 0, 'invalid local tree entry')
  const [, type, sha] = raw.slice(0, tab).split(' ')
  assert.equal(type, 'blob', `unexpected local tree entry type: ${raw}`)
  current.set(raw.slice(tab + 1), sha)
}

const classify = paths => {
  const groups = { exact: [], changed: [], absent: [] }
  for (const path of paths) {
    const sha = current.get(path)
    assert.ok(sha, `missing current path: ${path}`)
    const old = origin.get(path)
    if (old === sha) groups.exact.push(path)
    else if (old) groups.changed.push(path)
    else groups.absent.push(path)
  }
  return {
    counts: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length])),
    paths: { changed: groups.changed, absent: groups.absent },
  }
}

const cliNew = classify(inventory.paths.newPath.map(path => `apps/cli/${path}`))
const other = classify([...current.keys()].filter(path => !path.startsWith('apps/cli/')))
console.log(JSON.stringify({ currentCommit: head, originCommit, originTree: originTree.tree.length,
  cliNewRelativeToDshTui: cliNew, nonCliSource: other }, null, 2))
