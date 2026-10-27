import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { bundledNoticePolicy, verifyBundledNotices } from './bundled-notices.mjs'

const source = path => readFileSync(new URL(`../${path}`, import.meta.url))
const fixture = () => {
  const files = new Map()
  for (const policy of bundledNoticePolicy) {
    const root = `node_modules/${policy.name}`
    files.set(`${root}/package.json`, Buffer.from(JSON.stringify({ name: policy.name, license: policy.license })))
    for (const notice of Object.keys(policy.notices)) {
      files.set(`${root}/${notice}`, source(`${policy.source}/${notice}`))
    }
  }
  return {
    files,
    manifest: { bundledDependencies: bundledNoticePolicy.map(policy => policy.name) },
    verify() {
      return verifyBundledNotices({
        manifest: this.manifest,
        packed: new Set(this.files.keys()),
        readSource: source,
        readArchive: path => this.files.get(path),
      })
    },
  }
}

test('accepts the reviewed eight packages and their source-identical notices', () => {
  assert.doesNotThrow(() => fixture().verify())
})

test('rejects a new bundled dependency until its license is reviewed', () => {
  const f = fixture()
  f.manifest.bundledDependencies.push('@unknown/package')
  assert.throws(() => f.verify(), /bundled dependency list changed/u)
})

test('rejects an unlisted package copied into node_modules', () => {
  const f = fixture()
  f.files.set('node_modules/@unknown/package/index.js', Buffer.from(''))
  assert.throws(() => f.verify(), /unreviewed bundled package member/u)
  f.files.delete('node_modules/@unknown/package/index.js')
  f.files.set('node_modules/@dsh-std/core/node_modules/evil/index.js', Buffer.from(''))
  assert.throws(() => f.verify(), /nested bundled package requires review/u)
})

test('rejects a missing MIT license and a changed license declaration', () => {
  const f = fixture()
  f.files.delete('node_modules/@dsh-std/core/LICENSE')
  assert.throws(() => f.verify(), /bundled notice missing/u)
  f.files.set('node_modules/@dsh-std/core/LICENSE', source('vendor/dsh-std/packages/core/LICENSE'))
  f.files.set('node_modules/@dsh-std/core/package.json', Buffer.from('{"name":"@dsh-std/core","license":"UNLICENSED"}'))
  assert.throws(() => f.verify(), /bundled dependency license changed/u)
})

test('rejects tampered MathJax NOTICE and missing generated legal text', () => {
  const f = fixture()
  const root = 'node_modules/@flagqai-vendor/mathjax-tex-svg/'
  f.files.set(`${root}NOTICE`, Buffer.from('Apache-2.0'))
  assert.throws(() => f.verify(), /bundled notice differs/u)
  f.files.set(`${root}NOTICE`, source('vendor/mathjax-tex-svg/NOTICE'))
  f.files.delete(`${root}lib/index.mjs.LEGAL.txt`)
  assert.throws(() => f.verify(), /bundled notice missing/u)
})
