import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { inventoryInstalledPackage } from './registry-license-inventory.mjs'

test('separates bundled and nested registry packages and flags review items', () => {
  const root = mkdtempSync(join(tmpdir(), 'flagqai-license-inventory-'))
  const put = (path, name, license, notice) => {
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name, version: '1.0.0', license }))
    if (notice) writeFileSync(join(path, notice), 'terms')
  }
  try {
    const cliPath = join(root, 'node_modules/@flagqai/cli')
    put(cliPath, '@flagqai/cli', 'Apache-2.0', 'LICENSE')
    const manifest = JSON.parse(readFileSync(join(cliPath, 'package.json'), 'utf8'))
    manifest.bundledDependencies = ['@vendor/bundle']
    writeFileSync(join(cliPath, 'package.json'), JSON.stringify(manifest))
    put(join(cliPath, 'node_modules/@vendor/bundle'), '@vendor/bundle', 'MIT', 'LICENSE.md')
    put(join(root, 'node_modules/sharp'), 'sharp', 'Apache-2.0', 'LICENSE')
    put(join(root, 'node_modules/sharp/node_modules/@img/libvips'), '@img/libvips', 'LGPL-3.0-or-later')
    const report = inventoryInstalledPackage(root)
    assert.deepEqual(report.counts, { total: 4, cli: 1, bundled: 1, registry: 2, review: 1 })
    assert.deepEqual(report.packages.find(item => item.name === '@img/libvips').review,
      ['no standalone license or notice file', 'review license terms'])
    assert.equal(report.packages.find(item => item.name === '@vendor/bundle').source, 'bundled')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an embedded licensing summary does not clear a missing standalone notice or LGPL review', () => {
  const root = mkdtempSync(join(tmpdir(), 'flagqai-registry-license-'))
  try {
    const cli = join(root, 'node_modules', '@flagqai', 'cli')
    const libvips = join(root, 'node_modules', '@img', 'sharp-libvips-linux-x64')
    mkdirSync(cli, { recursive: true })
    mkdirSync(libvips, { recursive: true })
    writeFileSync(join(cli, 'package.json'), JSON.stringify({ name: '@flagqai/cli', version: '0.1.0', license: 'MIT' }))
    writeFileSync(join(cli, 'LICENSE'), 'MIT license text')
    writeFileSync(join(libvips, 'package.json'), JSON.stringify({ name: '@img/sharp-libvips-linux-x64', version: '1.3.3', license: 'LGPL-3.0-or-later' }))
    writeFileSync(join(libvips, 'README.md'), '# Package\n\n## Licensing\n\nlibvips | LGPLv3\n')
    mkdirSync(join(libvips, 'lib'), { recursive: true })
    writeFileSync(join(libvips, 'lib', 'libvips.so.42'), 'native fixture')

    const report = inventoryInstalledPackage(root)
    const item = report.packages.find(entry => entry.name === '@img/sharp-libvips-linux-x64')
    assert.equal(item.readmeLicenseSummary, true)
    assert.deepEqual(item.nativeArtifacts, [{
      path: 'lib/libvips.so.42',
      size: 14,
      sha256: createHash('sha256').update('native fixture').digest('hex'),
    }])
    assert.deepEqual(item.notices, [])
    assert.deepEqual(item.review, ['no standalone license or notice file', 'review license terms'])
    assert.equal(report.counts.review, 1)

    const strict = spawnSync(process.execPath, [fileURLToPath(new URL('./registry-license-inventory.mjs', import.meta.url)), root, '--strict'], { encoding: 'utf8' })
    assert.equal(strict.status, 1, strict.stderr)
    assert.equal(JSON.parse(strict.stdout).counts.review, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
