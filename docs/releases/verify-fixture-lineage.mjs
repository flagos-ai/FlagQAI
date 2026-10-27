#!/usr/bin/env node
/** Check imported test fixtures against a pinned blob inventory. No network calls. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(join(root, 'docs/releases/fixture-source-blobs.json'), 'utf8'))
const prefix = 'apps/cli/scripts/fixtures/'
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const tracked = git('ls-files', '-z', '--', prefix).split('\0').filter(Boolean)
const names = Object.keys(manifest.fixtures)

function fail(message) {
  throw new Error(`Fixture lineage: ${message}`)
}

if (names.length !== 86 || tracked.length !== names.length) fail(`expected 86 tracked fixtures, found ${tracked.length} and ${names.length} manifest entries`)
if (manifest.upstreamCommit !== 'c2eee95218d1decfce138f7d31ef7099cc391d00'
  || manifest.upstreamTree !== '62741b9b8b9dfab1dfb0ca28f065af140119613e'
  || manifest.extractionCommit !== '02a4d24e0dda0e9b8b28b7a1a1a826538538ee8f'
  || manifest.extractionTree !== '502aadaaa8a7a927b5d575a6760a4f825785588c') fail('pinned source identity changed')

const actual = new Set(tracked)
for (const name of names) {
  if (!/^[A-Za-z0-9._/-]+$/u.test(name) || name.split('/').some(part => part === '.' || part === '..')) fail(`unsafe path ${name}`)
  const path = `${prefix}${name}`
  if (!actual.has(path)) fail(`manifest path missing from tracked source: ${path}`)
  const expected = manifest.fixtures[name]
  if (!/^[0-9a-f]{40}$/u.test(expected)) fail(`invalid blob ID for ${path}`)
  if (git('hash-object', '--', path) !== expected) fail(`blob changed since the pinned source review: ${path}`)
  const content = readFileSync(join(root, path), 'utf8')
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/u.test(content)
    || /(?:sk-|Bearer\s+)[A-Za-z0-9_-]{16,}/u.test(content)) fail(`possible credential or address in ${path}`)
  actual.delete(path)
}
if (actual.size) fail(`unreviewed fixture path: ${[...actual][0]}`)

const args = process.argv.slice(2)
if (args.length !== 0 && (args.length !== 4 || args[0] !== '--upstream' || args[2] !== '--extraction')) {
  fail('usage: node verify-fixture-lineage.mjs [--upstream <tree.json> --extraction <tree.json>]')
}
if (args.length) {
  for (const [file, commit, treeSha, mapPath] of [
    [args[1], manifest.upstreamCommit, manifest.upstreamTree, name => `scripts/fixtures/${name}`],
    [args[3], manifest.extractionCommit, manifest.extractionTree, name => `${prefix}${name}`],
  ]) {
    const tree = JSON.parse(readFileSync(file, 'utf8'))
    if (tree.sha !== commit || tree.truncated !== false || !Array.isArray(tree.tree)) fail(`unexpected or truncated reference tree: ${file}`)
    // The recursive-tree response identifies the commit; its root tree ID is
    // cross-checked via GitHub's commit endpoint in the review record.
    const blobs = new Map(tree.tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, entry.sha]))
    for (const name of names) if (blobs.get(mapPath(name)) !== manifest.fixtures[name]) fail(`reference blob mismatch: ${name} in ${file}`)
    if (!/^[0-9a-f]{40}$/u.test(treeSha)) fail('invalid root tree ID')
  }
}
console.log(`PASS ${names.length} tracked fixture blobs match pinned source${args.length ? ' and both reference trees' : ' manifest'}; basic address/key screen clean`)
