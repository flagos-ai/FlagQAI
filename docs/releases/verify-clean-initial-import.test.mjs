import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { verifyCleanInitialImport, verifyPublicLicenseImport } from './verify-clean-initial-import.mjs'

async function withInitialCommit(check, filename = 'README.md') {
  const repository = await mkdtemp(join(tmpdir(), 'flagqai-public-export-'))
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  }).trim()
  try {
    git('init', '-q')
    await writeFile(join(repository, filename), 'reviewed fixture\n')
    git('add', filename)
    git('commit', '-qm', 'Initial source snapshot')
    const tree = git('rev-parse', 'HEAD^{tree}')
    await check({ repository, git, tree })
  } finally {
    await rm(repository, { recursive: true, force: true })
  }
}

test('accepts a clean standalone root commit matching the reviewed tree', async () => {
  await withInitialCommit(({ repository, git, tree }) => {
    assert.deepEqual(verifyCleanInitialImport(repository, tree), {
      head: git('rev-parse', 'HEAD'), tree, commitCount: 1,
    })
    assert.throws(() => verifyCleanInitialImport(repository, 'short'), /full Git object ID/u)
    assert.throws(() => verifyCleanInitialImport(repository, 'c'.repeat(40)), /differs from reviewed tree/u)
  })
})

test('accepts one reviewed source import after an approved public LICENSE-only root', async () => {
  await withInitialCommit(async ({ repository, git }) => {
    const base = git('rev-parse', 'HEAD')
    await writeFile(join(repository, 'README.md'), 'approved public source\n')
    git('add', 'README.md')
    git('commit', '-qm', 'Import reviewed source')
    const tree = git('rev-parse', 'HEAD^{tree}')
    assert.deepEqual(verifyPublicLicenseImport(repository, tree, base), {
      head: git('rev-parse', 'HEAD'), tree, commitCount: 2, publicBase: base,
    })
    assert.throws(() => verifyPublicLicenseImport(repository, tree, 'short'), /full Git object ID/)
    assert.throws(() => verifyPublicLicenseImport(repository, tree, 'c'.repeat(40)), /only the approved public root/)
    assert.throws(() => verifyPublicLicenseImport(repository, 'c'.repeat(40), base), /differs from reviewed tree/)
    git('remote', 'add', 'origin', '/private/tmp/source')
    assert.throws(() => verifyPublicLicenseImport(repository, tree, base), /no remotes/)
    git('remote', 'remove', 'origin')
    git('tag', 'extra')
    assert.throws(() => verifyPublicLicenseImport(repository, tree, base), /one branch and no other refs/)
    git('tag', '-d', 'extra')
    execFileSync('git', ['-C', repository, 'hash-object', '-w', '--stdin'], { input: 'unapproved private blob\n' })
    assert.throws(() => verifyPublicLicenseImport(repository, tree, base), /unreachable Git objects/)
  }, 'LICENSE')
})

test('rejects a non-license public root, extra history, or a replaced license', async () => {
  await withInitialCommit(async ({ repository, git }) => {
    const base = git('rev-parse', 'HEAD')
    await writeFile(join(repository, 'LICENSE'), 'new license\n')
    git('add', '.')
    git('commit', '-qm', 'Import')
    assert.throws(() => verifyPublicLicenseImport(repository, git('rev-parse', 'HEAD^{tree}'), base), /only a regular LICENSE/)
  })
  await withInitialCommit(async ({ repository, git }) => {
    const base = git('rev-parse', 'HEAD')
    await writeFile(join(repository, 'LICENSE'), 'replacement license\n')
    git('add', '.')
    git('commit', '-qm', 'Changed license')
    assert.throws(() => verifyPublicLicenseImport(repository, git('rev-parse', 'HEAD^{tree}'), base), /preserve.*LICENSE/)
    await writeFile(join(repository, 'README.md'), 'extra history\n')
    git('add', '.')
    git('commit', '-qm', 'Extra commit')
    assert.throws(() => verifyPublicLicenseImport(repository, git('rev-parse', 'HEAD^{tree}'), base), /only the approved public root/)
  }, 'LICENSE')
})

test('rejects working changes and reachable private history', async () => {
  await withInitialCommit(async ({ repository, git, tree }) => {
    await writeFile(join(repository, 'README.md'), 'changed fixture\n')
    assert.throws(() => verifyCleanInitialImport(repository, tree), /uncommitted changes/u)
    git('add', 'README.md')
    git('commit', '-qm', 'Extra history')
    assert.throws(() => verifyCleanInitialImport(repository, tree), /only its new initial commit/u)
  })
})

test('rejects an extra tag even when it points to the sole root commit', async () => {
  await withInitialCommit(({ repository, git, tree }) => {
    git('tag', 'old-release')
    assert.throws(() => verifyCleanInitialImport(repository, tree), /one branch and no other refs/u)
  })
})

test('rejects a detached HEAD even when the sole branch points to the reviewed commit', async () => {
  await withInitialCommit(({ repository, git, tree }) => {
    git('checkout', '--detach', '-q')
    assert.throws(() => verifyCleanInitialImport(repository, tree), /HEAD must be attached to its sole branch/u)
  })
})

test('rejects a remote that could retain a private repository URL', async () => {
  await withInitialCommit(({ repository, git, tree }) => {
    git('remote', 'add', 'source', '/private/tmp/private-source-repository')
    assert.throws(() => verifyCleanInitialImport(repository, tree), /must have no remotes/u)
    git('remote', 'remove', 'source')
    assert.equal(verifyCleanInitialImport(repository, tree).tree, tree)
  })
})

test('rejects unreachable private objects left in a reused object store', async () => {
  await withInitialCommit(({ repository, git, tree }) => {
    execFileSync('git', ['-C', repository, 'hash-object', '-w', '--stdin'], {
      input: 'private historical source\n', encoding: 'utf8',
    })
    assert.throws(() => verifyCleanInitialImport(repository, tree), /unreachable Git objects/u)
  })
})

test('rejects an alternate object store and grafted history', async () => {
  await withInitialCommit(async ({ repository, tree }) => {
    const alternates = join(repository, '.git', 'objects', 'info', 'alternates')
    await writeFile(alternates, '/private/tmp/other-objects\n')
    assert.throws(() => verifyCleanInitialImport(repository, tree), /alternate object store/u)
    await rm(alternates)
    await mkdir(join(repository, '.git', 'info'), { recursive: true })
    await writeFile(join(repository, '.git', 'info', 'grafts'), '')
    assert.throws(() => verifyCleanInitialImport(repository, tree), /grafted history/u)
  })
})
