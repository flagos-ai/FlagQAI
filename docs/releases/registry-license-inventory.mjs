#!/usr/bin/env node
// Inventory the exact dependency tree from an isolated, installed CLI tarball.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const noticePattern = /^(?:licen[sc]e|copying|notice)(?:[._-].*)?$/iu
const reviewLicensePattern = /\b(?:A?GPL|LGPL|MPL|EPL|CDDL)(?:-[\d.]+)?\b/iu
const nativeArtifactPattern = /(?:\.node|\.dylib|\.dll|\.wasm|\.so(?:\.\d+)*|\.a)$/iu

function nativeArtifacts(packagePath) {
  const artifacts = []
  const visit = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        visit(child)
      } else if (entry.isFile() && nativeArtifactPattern.test(entry.name)) {
        const bytes = readFileSync(child)
        artifacts.push({
          path: relative(packagePath, child).split('\\').join('/'),
          size: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        })
      }
    }
  }
  visit(packagePath)
  return artifacts.sort((a, b) => a.path.localeCompare(b.path))
}

function directories(path) {
  return readdirSync(path, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
    .map(entry => join(path, entry.name))
}

function packageDirectories(modulesPath) {
  const found = []
  for (const path of directories(modulesPath)) {
    if (basename(path).startsWith('.')) continue
    if (basename(path).startsWith('@')) found.push(...directories(path))
    else found.push(path)
  }
  return found
}

export function inventoryInstalledPackage(installRoot) {
  const root = resolve(installRoot)
  const cliPath = join(root, 'node_modules/@flagqai/cli')
  const manifest = JSON.parse(readFileSync(join(cliPath, 'package.json'), 'utf8'))
  const bundled = new Set(manifest.bundledDependencies ?? manifest.bundleDependencies ?? [])
  const packages = []
  const inspect = path => {
    const metadata = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
    const license = typeof metadata.license === 'string' ? metadata.license : null
    const notices = readdirSync(path, { withFileTypes: true })
      .filter(entry => entry.isFile() && noticePattern.test(entry.name))
      .map(entry => entry.name)
      .sort()
    const location = relative(root, path).split('\\').join('/') || '.'
    const review = []
    if (!license) review.push('missing license metadata')
    if (notices.length === 0) review.push('no standalone license or notice file')
    if (license && reviewLicensePattern.test(license)) review.push('review license terms')
    const readmePath = join(path, 'README.md')
    // A licensing summary is useful evidence, but is not a substitute for full
    // license texts or a redistribution review. Preserve the strict findings.
    const readmeLicenseSummary = existsSync(readmePath)
      && /^## Licensing\s*$/mu.test(readFileSync(readmePath, 'utf8'))
    packages.push({
      name: metadata.name,
      version: metadata.version,
      license,
      location,
      source: path === cliPath ? 'cli' : bundled.has(metadata.name) && path === join(cliPath, 'node_modules', metadata.name) ? 'bundled' : 'registry',
      notices,
      readmeLicenseSummary,
      review,
      nativeArtifacts: review.length > 0 ? nativeArtifacts(path) : [],
    })
    const nested = join(path, 'node_modules')
    try {
      for (const dependency of packageDirectories(nested)) inspect(dependency)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  for (const dependency of packageDirectories(join(root, 'node_modules'))) inspect(dependency)
  packages.sort((a, b) => a.location.localeCompare(b.location))
  return {
    packages,
    counts: {
      total: packages.length,
      cli: packages.filter(item => item.source === 'cli').length,
      bundled: packages.filter(item => item.source === 'bundled').length,
      registry: packages.filter(item => item.source === 'registry').length,
      review: packages.filter(item => item.review.length > 0).length,
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const strict = args.includes('--strict')
  const path = args.find(arg => !arg.startsWith('--'))
  if (!path || args.some(arg => arg.startsWith('--') && arg !== '--strict')) {
    console.error('Usage: node docs/releases/registry-license-inventory.mjs <installed-cli-directory> [--strict]')
    process.exitCode = 2
  } else {
    try {
      const result = inventoryInstalledPackage(path)
      console.log(JSON.stringify(result, null, 2))
      if (strict && result.counts.review > 0) process.exitCode = 1
    } catch (error) {
      console.error(error.message)
      process.exitCode = 2
    }
  }
}
