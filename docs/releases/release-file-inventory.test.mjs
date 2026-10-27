import assert from 'node:assert/strict'
import test from 'node:test'
import { digestPackageContents, isBinary, parseGitBlobs, parseGitTree, validateArchiveMembers } from './release-file-inventory.mjs'

const first = 'a'.repeat(40)
const second = 'b'.repeat(40)

test('the full Git tree retains file modes and exact paths', () => {
  const tree = Buffer.from(`100755 blob ${second}\tz-script\0` +
    `120000 blob ${first}\tlinked-entry\0`)
  assert.deepEqual(parseGitTree(tree), [
    { path: 'linked-entry', mode: '120000', type: 'blob', oid: first },
    { path: 'z-script', mode: '100755', type: 'blob', oid: second },
  ])
  assert.throws(() => parseGitTree(Buffer.from(`100644 blob ${first}\tx`)), /end with NUL/u)
  assert.throws(() => parseGitTree(Buffer.concat([
    Buffer.from(`100644 blob ${first}\t`), Buffer.from([0xc3, 0x28, 0]),
  ])), /encoded data|UTF-8/u)
})

test('the package content digest is independent of order but detects file changes', () => {
  const files = [
    { path: 'lib/index.js', mode: 0o644, size: 2, sha256: 'a'.repeat(64) },
    { path: 'LICENSE', mode: 0o644, size: 3, sha256: 'b'.repeat(64) },
  ]
  const digest = digestPackageContents(files)
  assert.equal(digestPackageContents(files.toReversed()), digest)
  assert.notEqual(digestPackageContents([{ ...files[0], mode: 0o755 }, files[1]]), digest)
  assert.notEqual(digestPackageContents([{ ...files[0], sha256: 'c'.repeat(64) }, files[1]]), digest)
  assert.throws(() => digestPackageContents([files[0], files[0]]), /duplicate package file/u)
})

test('Git batch framing detects binary input and rejects truncated content', () => {
  const batch = Buffer.concat([
    Buffer.from(`${first} blob 3\nabc\n${second} blob 3\n`),
    Buffer.from([0x61, 0x00, 0x62, 0x0a]),
  ])
  assert.deepEqual([...parseGitBlobs(batch, [first, second])], [
    [first, { size: 3, binary: false }],
    [second, { size: 3, binary: true }],
  ])
  assert.throws(() => parseGitBlobs(batch.subarray(0, -1), [first, second]), /separator/u)
  assert.equal(isBinary(Buffer.from([0xc3, 0x28])), true)
})

test('tar members must match the npm report without escaping the package root', () => {
  const expected = [{ path: 'LICENSE' }, { path: 'lib/index.js' }]
  assert.deepEqual(validateArchiveMembers(['package/lib/index.js', 'package/LICENSE'], expected),
    ['lib/index.js', 'LICENSE'])
  assert.throws(() => validateArchiveMembers(['package/../secret', 'package/LICENSE'], expected), /unsafe tar member/u)
  assert.throws(() => validateArchiveMembers(['package/LICENSE', 'package/LICENSE'], expected), /duplicate tar members/u)
  assert.throws(() => validateArchiveMembers(['package/LICENSE'], expected), /differ/u)
})
