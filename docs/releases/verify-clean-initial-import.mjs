#!/usr/bin/env node
/** Check that a reviewed source snapshot has only approved public history.
 * This verifies history and content identity, never redistribution rights. */
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const OID = /^[0-9a-f]{40,64}$/u

function git(repository, ...args) {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim()
}

export function verifyCleanInitialImport(repository, expectedTree, runGit = git) {
  return verifyImport(repository, expectedTree, undefined, runGit)
}

/** Preserve an explicitly approved public LICENSE-only root, never private history. */
export function verifyPublicLicenseImport(repository, expectedTree, expectedBase, runGit = git) {
  if (!OID.test(expectedBase)) throw new Error('Expected public base must be a full Git object ID')
  return verifyImport(repository, expectedTree, expectedBase, runGit)
}

function verifyImport(repository, expectedTree, publicBase, runGit) {
  if (!OID.test(expectedTree)) throw new Error('Expected tree must be a full Git object ID')
  const gitDirectory = join(repository, '.git')
  if (!existsSync(gitDirectory) || !lstatSync(gitDirectory).isDirectory()) {
    throw new Error('Candidate must be a standalone Git repository with its own .git directory')
  }
  for (const [relative, label] of [
    ['objects/info/alternates', 'alternate object store'],
    ['info/grafts', 'grafted history'],
    ['shallow', 'shallow history'],
  ]) {
    if (existsSync(join(gitDirectory, relative))) {
      throw new Error(`Candidate public repository contains ${label}`)
    }
  }
  if (runGit(repository, 'status', '--porcelain') !== '') {
    throw new Error('Candidate public repository has uncommitted changes')
  }
  if (runGit(repository, 'remote') !== '') {
    throw new Error('Candidate public repository must have no remotes before its source and history are approved')
  }
  const head = runGit(repository, 'rev-parse', 'HEAD')
  const refs = runGit(repository, 'for-each-ref', '--format=%(refname)').split('\n').filter(Boolean)
  let currentBranch
  try { currentBranch = runGit(repository, 'symbolic-ref', '--quiet', 'HEAD') }
  catch { throw new Error('Candidate public repository HEAD must be attached to its sole branch') }
  if (refs.length !== 1 || !refs[0].startsWith('refs/heads/') || refs[0] !== currentBranch) {
    throw new Error('Candidate public repository must contain exactly one branch and no other refs')
  }
  const reachable = runGit(repository, 'rev-list', '--topo-order', '--all').split('\n').filter(Boolean)
  if (publicBase === undefined) {
    if (reachable.length !== 1 || reachable[0] !== head) {
      throw new Error('Candidate public repository must contain only its new initial commit')
    }
    if (runGit(repository, 'rev-list', '--parents', '-n', '1', 'HEAD') !== head) {
      throw new Error('Candidate public repository initial commit has a parent')
    }
  } else {
    if (reachable.length !== 2 || reachable[0] !== head || reachable[1] !== publicBase
      || runGit(repository, 'rev-list', '--parents', '-n', '1', head) !== `${head} ${publicBase}`
      || runGit(repository, 'rev-list', '--parents', '-n', '1', publicBase) !== publicBase) {
      throw new Error('Candidate must contain only the approved public root and one source import commit')
    }
    if (runGit(repository, 'ls-tree', '-r', '--name-only', publicBase) !== 'LICENSE'
      || !runGit(repository, 'ls-tree', publicBase, '--', 'LICENSE').startsWith('100644 blob ')) {
      throw new Error('Approved public root must contain only a regular LICENSE file')
    }
    if (runGit(repository, 'rev-parse', `${publicBase}:LICENSE`) !== runGit(repository, 'rev-parse', 'HEAD:LICENSE')) {
      throw new Error('Source import must preserve the approved public LICENSE')
    }
  }
  const tree = runGit(repository, 'rev-parse', 'HEAD^{tree}')
  if (tree !== expectedTree) {
    throw new Error(`Candidate source tree ${tree} differs from reviewed tree ${expectedTree}`)
  }
  const unreachable = runGit(repository, 'fsck', '--full', '--no-reflogs', '--unreachable')
  if (unreachable !== '') {
    throw new Error('Candidate public repository contains unreachable Git objects')
  }
  return { head, tree, commitCount: publicBase === undefined ? 1 : 2,
    ...(publicBase === undefined ? {} : { publicBase }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [repository, expectedTree, ...extra] = process.argv.slice(2)
  if (!repository || !expectedTree || (extra.length !== 0 && (extra.length !== 2 || extra[0] !== '--public-license-base'))) {
    console.error('Usage: node docs/releases/verify-clean-initial-import.mjs <new-repo-path> <reviewed-tree-oid> [--public-license-base <approved-public-root-oid>]')
    process.exit(2)
  }
  try {
    console.log(JSON.stringify(extra.length === 0
      ? verifyCleanInitialImport(resolve(repository), expectedTree)
      : verifyPublicLicenseImport(resolve(repository), expectedTree, extra[1])))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
