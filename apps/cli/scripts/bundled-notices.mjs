import assert from 'node:assert/strict'

/** Reviewed workspace dependencies copied into the CLI tarball by pack-flagqai. */
export const bundledNoticePolicy = Object.freeze([
  ...['command', 'connection', 'core', 'manifest', 'messages', 'presentation', 'storage']
    .map(packageName => ({
      name: `@dsh-std/${packageName}`,
      license: 'MIT',
      source: `vendor/dsh-std/packages/${packageName}`,
      notices: { LICENSE: ['MIT License', 'DSH Standard contributors'] },
    })),
  {
    name: '@flagqai-vendor/mathjax-tex-svg',
    license: 'Apache-2.0',
    source: 'vendor/mathjax-tex-svg',
    notices: {
      LICENSE: ['Apache License'],
      NOTICE: ['The MathJax Consortium', 'Martin Hensel'],
      'lib/index.mjs.LEGAL.txt': ['Martin Hensel', 'Apache License'],
    },
  },
])

/** Check package metadata and notice *contents*, not only archive members. */
export function verifyBundledNotices({ manifest, packed, readArchive, readSource }) {
  const declared = [...(manifest.bundledDependencies ?? [])].sort()
  const reviewed = bundledNoticePolicy.map(policy => policy.name).sort()
  assert.deepEqual(declared, reviewed, 'bundled dependency list changed; review its licenses before packing')
  const reviewedSet = new Set(reviewed)
  for (const path of packed) {
    if (!path.startsWith('node_modules/')) continue
    assert.ok(!path.slice('node_modules/'.length).includes('/node_modules/'),
      `nested bundled package requires review: ${path}`)
    const parts = path.split('/')
    const name = parts[1]?.startsWith('@') ? `${parts[1]}/${parts[2]}` : parts[1]
    assert.ok(reviewedSet.has(name), `unreviewed bundled package member: ${path}`)
  }

  for (const policy of bundledNoticePolicy) {
    const archiveRoot = `node_modules/${policy.name}`
    const manifestPath = `${archiveRoot}/package.json`
    assert.ok(packed.has(manifestPath), `bundled dependency manifest missing: ${manifestPath}`)
    const bundledManifest = JSON.parse(readArchive(manifestPath).toString('utf8'))
    assert.equal(bundledManifest.name, policy.name, `bundled dependency name mismatch: ${policy.name}`)
    assert.equal(bundledManifest.license, policy.license, `bundled dependency license changed: ${policy.name}`)

    for (const [notice, requiredText] of Object.entries(policy.notices)) {
      const archivePath = `${archiveRoot}/${notice}`
      const sourcePath = `${policy.source}/${notice}`
      assert.ok(packed.has(archivePath), `bundled notice missing: ${archivePath}`)
      const source = readSource(sourcePath)
      for (const marker of requiredText) {
        assert.ok(source.toString('utf8').includes(marker), `reviewed notice marker missing: ${sourcePath}: ${marker}`)
      }
      assert.deepEqual(readArchive(archivePath), source,
        `bundled notice differs from reviewed source: ${archivePath}`)
    }
  }
}
