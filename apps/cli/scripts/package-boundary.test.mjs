import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyPackageBoundary } from './package-boundary.mjs'

const baseline = ['package.json', 'README.md', 'LICENSE', 'UPSTREAM.md',
  'OPEN_SOURCE_NOTICES.md', 'THIRD_PARTY_LICENSES', 'LICENSES/FlagQAI-Apache-2.0.txt', 'bin/flagqai.js']

test('accepts the reviewed CLI distribution surface', () => {
  assert.doesNotThrow(() => verifyPackageBoundary(baseline))
})

test('rejects artwork, native source, credentials, and unexpected roots', () => {
  for (const path of ['assets/whaleGirl/frames.json', 'apps/desktop/native/main.swift',
    '.env.local', 'lib/.npmrc', 'migration/private.js', '../outside']) {
    assert.throws(() => verifyPackageBoundary([...baseline, path]), path)
  }
})

test('rejects artwork and font files even within an otherwise allowed package path', () => {
  for (const path of [
    'lib/components/portrait.png',
    'lib/animation/idle.webp',
    'guide/logo.svg',
    'node_modules/@dsh-std/core/fonts/brand.woff2',
  ]) assert.throws(() => verifyPackageBoundary([...baseline, path]), /unreviewed artwork or font/u)
})

test('rejects the former embedded portrait even when compiled as source', () => {
  for (const path of ['lib/components/whaleGirlSprite.js', 'lib/components/whaleGirlSprite.d.ts', 'lib/components/whaleGirlSprite.js.map']) {
    assert.throws(() => verifyPackageBoundary([...baseline, path]), /unreviewed embedded portrait/u)
  }
})

test('rejects unused imported Ink wrappers from the staged distribution', () => {
  for (const path of ['lib/ink/components/Button.js', 'lib/ink/components/RawAnsi.js', 'lib/ink/components/RawAnsi.d.ts']) {
    assert.throws(() => verifyPackageBoundary([...baseline, path]), /unused imported Ink wrapper/u)
  }
})

test('keeps optional sharp and its platform binaries outside the CLI tarball', () => {
  for (const path of [
    'node_modules/sharp/package.json',
    'node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.42.dylib',
    'node_modules/@dsh-std/core/node_modules/@img/sharp-libvips-linux-x64/lib/libvips.so',
  ]) assert.throws(() => verifyPackageBoundary([...baseline, path]), /unreviewed sharp binary dependency/u)
})

test('requires upstream, third-party, and FlagQAI license notices', () => {
  for (const path of ['LICENSE', 'UPSTREAM.md', 'THIRD_PARTY_LICENSES', 'LICENSES/FlagQAI-Apache-2.0.txt']) {
    assert.throws(() => verifyPackageBoundary(baseline.filter(entry => entry !== path)), path)
  }
})
