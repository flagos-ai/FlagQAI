#!/usr/bin/env node
/** Inventory a committed private source snapshot and its staged CLI tarball.
 * This identifies review inputs; it does not grant redistribution rights. */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packFlagqai } from '../../apps/cli/scripts/pack-flagqai.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const decode = new TextDecoder('utf-8', { fatal: true })

export function parseGitTree(buffer) {
  assert.equal(buffer.at(-1), 0, 'Git tree output must end with NUL')
  const entries = []
  for (let start = 0; start < buffer.length - 1;) {
    const end = buffer.indexOf(0, start)
    assert.ok(end > start, 'invalid Git tree record')
    const record = buffer.subarray(start, end)
    const tab = record.indexOf(9)
    assert.ok(tab > 0, 'invalid Git tree record')
    const [mode, type, oid] = decode.decode(record.subarray(0, tab)).split(' ')
    const path = decode.decode(record.subarray(tab + 1))
    assert.match(oid, /^[a-f0-9]{40}$/u)
    assert.ok(path && !path.includes('\n'), `unsafe Git path: ${path}`)
    entries.push({ path, mode, type, oid })
    start = end + 1
  }
  assert.equal(new Set(entries.map(entry => entry.path)).size, entries.length, 'duplicate Git path')
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

export function parseGitBlobs(buffer, requested) {
  const blobs = new Map()
  let offset = 0
  for (const oid of requested) {
    const newline = buffer.indexOf(10, offset)
    assert.ok(newline > offset, 'missing Git blob header')
    const [actual, type, sizeText] = buffer.subarray(offset, newline).toString('ascii').split(' ')
    const size = Number(sizeText)
    assert.equal(actual, oid, 'Git returned an unexpected blob')
    assert.equal(type, 'blob')
    assert.ok(Number.isSafeInteger(size) && size >= 0, 'invalid Git blob size')
    const content = buffer.subarray(newline + 1, newline + 1 + size)
    assert.equal(content.length, size, 'truncated Git blob')
    assert.equal(buffer[newline + 1 + size], 10, 'missing Git blob separator')
    blobs.set(oid, { size, binary: isBinary(content) })
    offset = newline + 2 + size
  }
  assert.equal(offset, buffer.length, 'extra Git batch output')
  return blobs
}

export function isBinary(bytes) {
  if (bytes.includes(0)) return true
  try { decode.decode(bytes); return false }
  catch { return true }
}

// A platform-independent digest of the packaged file list and contents.
// The tarball's gzip metadata can differ even when every extracted file matches.
export function digestPackageContents(files) {
  const hash = createHash('sha256')
  const paths = new Set()
  for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    assert.ok(!paths.has(file.path), `duplicate package file: ${file.path}`)
    paths.add(file.path)
    assert.match(file.sha256, /^[a-f0-9]{64}$/u)
    hash.update(JSON.stringify([file.path, file.mode, file.size, file.sha256]) + '\n')
  }
  return hash.digest('hex')
}

export function validateArchiveMembers(members, expected) {
  const paths = members.map(member => {
    assert.ok(member.startsWith('package/'), `unexpected tar member: ${member}`)
    const path = member.slice('package/'.length)
    assert.ok(path && !path.endsWith('/') && !path.split('/').some(part => part === '.' || part === '..' || part === ''),
      `unsafe tar member: ${member}`)
    return path
  })
  assert.equal(new Set(paths).size, paths.length, 'duplicate tar members')
  assert.deepEqual(paths.toSorted(), expected.map(file => file.path).toSorted(), 'npm report and tar members differ')
  return paths
}

function checked(command, args, options = {}) {
  const result = spawnSync(command, args, { ...options, maxBuffer: 128 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr?.toString() ?? result.error?.message}`)
  }
  return result.stdout
}

export async function createReleaseFileInventory({ destination, ref = 'HEAD' }) {
  const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  assert.equal(commit, head, 'the package must be inventoried against the checked-out HEAD')
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }), '',
    'commit all tracked source changes before inventorying the release candidate')
  const tree = execFileSync('git', ['rev-parse', `${commit}^{tree}`], { cwd: root, encoding: 'utf8' }).trim()
  const entries = parseGitTree(execFileSync('git', ['ls-tree', '-rz', commit], { cwd: root }))
  const oids = [...new Set(entries.filter(entry => entry.type === 'blob').map(entry => entry.oid))]
  const blobs = parseGitBlobs(checked('git', ['cat-file', '--batch'], { cwd: root, input: `${oids.join('\n')}\n` }), oids)
  const sourceFiles = entries.map(entry => ({ ...entry, ...(blobs.get(entry.oid) ?? {}) }))
  const temporary = await mkdtemp(join(tmpdir(), 'flagqai-release-inventory-'))
  try {
    const packageReport = await packFlagqai({ destination: temporary })
    const archiveMembers = checked('tar', ['-tzf', packageReport.path], { encoding: 'utf8' }).trimEnd().split('\n')
    validateArchiveMembers(archiveMembers, packageReport.files)
    const extracted = join(temporary, 'extracted')
    await mkdir(extracted)
    checked('tar', ['-xzf', packageReport.path, '-C', extracted])
    const packageFiles = []
    for (const file of packageReport.files) {
      const path = join(extracted, 'package', file.path)
      const metadata = await lstat(path)
      assert.ok(metadata.isFile(), `non-file tar member: ${file.path}`)
      const content = await readFile(path)
      assert.equal(content.length, file.size, `npm report size mismatch: ${file.path}`)
      packageFiles.push({ path: file.path, size: content.length, mode: file.mode,
        sha256: sha256(content), binary: isBinary(content) })
    }
    const findings = {
      sourceNonFiles: sourceFiles.filter(file => file.type !== 'blob' || !['100644', '100755'].includes(file.mode)).map(file => file.path),
      sourceBinary: sourceFiles.filter(file => file.binary).map(file => file.path),
      packageBinary: packageFiles.filter(file => file.binary).map(file => file.path),
    }
    const report = {
      schema: 'flagqai-release-file-inventory-v1', commit, tree,
      source: { count: sourceFiles.length, files: sourceFiles },
      package: { name: packageReport.name, version: packageReport.version,
        archiveSha256: sha256(await readFile(packageReport.path)),
        contentSha256: digestPackageContents(packageFiles), count: packageFiles.length, files: packageFiles },
      findings,
    }
    await writeFile(destination, JSON.stringify(report, null, 2) + '\n')
    return report
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--out') {
    throw new Error('Usage: node docs/releases/release-file-inventory.mjs --out <report.json>')
  }
  const destination = resolve(args[1])
  const report = await createReleaseFileInventory({ destination })
  console.log(`Inventory ${report.commit}: ${report.source.count} Git entries, ${report.package.count} tarball files; ` +
    `${Object.values(report.findings).reduce((sum, paths) => sum + paths.length, 0)} file-type findings. Report: ${destination}`)
  if (Object.values(report.findings).some(paths => paths.length > 0)) process.exitCode = 1
}
