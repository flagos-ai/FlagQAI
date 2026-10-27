#!/usr/bin/env node
// Compare the tracked renderer against two pinned, complete upstream trees.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const references = {
  dsh: { commit: 'c2eee95218d1decfce138f7d31ef7099cc391d00', tree: '62741b9b8b9dfab1dfb0ca28f065af140119613e' },
  ink: { commit: '991aaa54eae39e1ad6d1964e747ea936d5a4ad12', tree: '2a183a364013fd272fa71ceab8335a43834f79c4' },
}

function readTree(path, expected) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  if (data.sha !== expected.commit || data.truncated !== false || !Array.isArray(data.tree)) {
    throw new Error(`Expected complete pinned Git tree ${expected.commit}: ${path}`)
  }
  const children = new Map()
  for (const entry of data.tree) {
    const split = entry.path.lastIndexOf('/')
    const parent = split < 0 ? '' : entry.path.slice(0, split)
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push(entry)
  }
  for (const [parent, entries] of children) {
    entries.sort((a, b) => Buffer.compare(
      Buffer.from(a.path.slice(parent ? parent.length + 1 : 0) + (a.type === 'tree' ? '/' : '')),
      Buffer.from(b.path.slice(parent ? parent.length + 1 : 0) + (b.type === 'tree' ? '/' : '')),
    ))
    const body = Buffer.concat(entries.flatMap(entry => [
      Buffer.from(`${parseInt(entry.mode, 8).toString(8)} ${entry.path.slice(parent ? parent.length + 1 : 0)}\0`),
      Buffer.from(entry.sha, 'hex'),
    ]))
    const actual = createHash('sha1').update(Buffer.from(`tree ${body.length}\0`)).update(body).digest('hex')
    const expectedHash = parent ? data.tree.find(entry => entry.path === parent && entry.type === 'tree')?.sha : expected.tree
    if (actual !== expectedHash) throw new Error(`Pinned Git tree contents differ at ${parent || '/'}: ${path}`)
  }
  return new Map(data.tree.filter(item => item.type === 'blob').map(item => [item.path, item.sha]))
}

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const paths = args.filter(arg => !arg.startsWith('--'))
if (paths.length !== 2 || args.some(arg => arg.startsWith('--') && arg !== '--strict')) {
  console.error('Usage: node docs/releases/ink-extension-lineage.mjs <dsh-tree.json> <ink-tree.json> [--strict]')
  process.exitCode = 2
} else {
  try {
    const dsh = readTree(paths[0], references.dsh)
    const ink = readTree(paths[1], references.ink)
    const tracked = execFileSync('git', ['ls-files', 'apps/cli/src/ink'], { encoding: 'utf8' }).trim().split('\n')
    const rows = tracked.map(path => {
      const relative = path.slice('apps/cli/src/ink/'.length)
      const blob = execFileSync('git', ['hash-object', resolve(path)], { encoding: 'utf8' }).trim()
      const imported = dsh.get(`src/ink/${relative}`)
      return {
        path: relative,
        officialInkPath: ink.has(`src/${relative}`),
        importState: imported === blob ? 'exact' : imported ? 'modified' : 'absent',
      }
    })
    const source = rows.filter(row => row.path !== 'README.md')
    const extensions = source.filter(row => !row.officialInkPath)
    const group = path => path.includes('/') ? path.split('/')[0] : '(top-level)'
    const extensionGroups = Object.fromEntries([...new Set(extensions.map(row => group(row.path)))].sort()
      .map(key => [key, extensions.filter(row => group(row.path) === key).length]))
    const report = {
      references,
      counts: {
        tracked: rows.length,
        officialInkPaths: source.length - extensions.length,
        extensionPaths: extensions.length,
        exactDshSource: source.filter(row => row.importState === 'exact').length,
        changedOrAbsentSource: source.filter(row => row.importState !== 'exact').length,
      },
      extensionGroups,
      exceptions: rows.filter(row => row.importState !== 'exact'),
    }
    console.log(JSON.stringify(report, null, 2))
    if (strict && report.counts.changedOrAbsentSource > 0) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
  }
}
