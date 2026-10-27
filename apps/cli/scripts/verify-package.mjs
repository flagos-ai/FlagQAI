import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { GUIDE_DIR, guideFiles } from './guide-sources.mjs'
import { verifyPackageBoundary } from './package-boundary.mjs'
import { verifyBundledNotices } from './bundled-notices.mjs'

const input = await new Promise((resolve, reject) => {
  let value = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => { value += chunk })
  process.stdin.on('end', () => resolve(value))
  process.stdin.on('error', reject)
})

const reports = JSON.parse(input)
// npm 10 emits an array while npm 11 emits an object keyed by package name.
const report = Array.isArray(reports) ? reports[0] : Object.values(reports)[0]
if (report === undefined || !Array.isArray(report.files)) {
  throw new Error('npm pack did not return a package file list')
}
verifyPackageBoundary(report.files)

const thirdPartyNotice = spawnSync('tar', ['-xOzf', report.path, 'package/THIRD_PARTY_LICENSES'], {
  encoding: 'utf8',
})
if (thirdPartyNotice.error || thirdPartyNotice.status !== 0) {
  throw new Error(thirdPartyNotice.stderr || thirdPartyNotice.error?.message || 'Cannot inspect packaged third-party notices')
}
for (const marker of [
  'Copyright (c) 2026 Sergey Golovin',
  'Copyright (c) 2026 Venkata Sai Chirasani',
  'https://github.com/ccch1mneyyy/working-activity',
  'https://github.com/openai/codex/pull/34365',
]) {
  if (!thirdPartyNotice.stdout.includes(marker)) {
    throw new Error(`Packaged third-party notices are missing ${marker}`)
  }
}

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packed = new Set(report.files.map(file => file.path.replaceAll('\\', '/')))
verifyBundledNotices({
  manifest,
  packed,
  readSource: path => readFileSync(new URL(`../${path}`, import.meta.url)),
  readArchive: path => {
    const result = spawnSync('tar', ['-xOzf', report.path, `package/${path}`], {
      maxBuffer: 16 * 1024 * 1024,
    })
    if (result.error || result.status !== 0) {
      throw new Error(`Cannot inspect bundled notice ${path}: ${result.error?.message ?? result.stderr.toString('utf8')}`)
    }
    return result.stdout
  },
})
const targets = new Set()

const addTarget = value => {
  if (typeof value === 'string') targets.add(value.replace(/^\.\//u, ''))
}

addTarget(manifest.main)
addTarget(manifest.types)
for (const target of Object.values(manifest.bin ?? {})) addTarget(target)

const collectExports = value => {
  if (typeof value === 'string') {
    addTarget(value)
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const nested of Object.values(value)) collectExports(nested)
}
collectExports(manifest.exports)

const missing = [...targets].filter(target => !packed.has(target))
if (missing.length > 0) {
  throw new Error(`package exports missing from tarball: ${missing.join(', ')}`)
}
for (const presetFile of [
  'presets/liangshen/agent.cordis.yml',
  'presets/liangshen/preset.yml',
  'presets/liangshen/.flagqai-managed.json',
  'presets/liangshen/tool-bootstrap.mjs',
]) {
  if (!packed.has(presetFile)) throw new Error(`packaged preset file missing from tarball: ${presetFile}`)
}
// 随包用户手册必须真的进 tarball：它是 npm 用户机器上唯一的一份手册，
// 少了 guide/ 就等于"AI 无从查起"。（`skills/` 仍按 #613 的结论不打包。）
for (const guideFile of ['SKILL.md', ...guideFiles()]) {
  const entry = `${GUIDE_DIR}/${guideFile}`
  if (!packed.has(entry)) throw new Error(`packaged user guide missing from tarball: ${entry}`)
}
if (!packed.has('README.md')) throw new Error('packaged guide index link needs the package README')
if (!packed.has('guide/flagqai-guide/SKILL.md')) {
  throw new Error('packaged legacy guide alias missing from tarball')
}
for (const path of packed) {
  const lower = path.toLowerCase()
  if (lower.includes('plugin-spec/')
    || /dsh-adapter\/(?:grants|host-descriptor)(?:\.|$)/u.test(lower)) {
    throw new Error(`npm package contains legacy compat shim (case-insensitive): ${path}`)
  }
}
if ([...packed].some(path => path.startsWith('src/'))) {
  throw new Error('npm package unexpectedly contains TypeScript sources')
}
if ([...packed].some(path => path.startsWith('skills/') || path.startsWith('.agents/skills/'))) {
  throw new Error('npm package unexpectedly contains developer skills')
}
if (packed.has('lib/invariant.js')) {
  throw new Error('npm package contains the obsolete hand-built invariant entry')
}

// The staged manifest differs only by its source-only prepare hook; npm does
// not rewrite workspace protocols. A `workspace:` range on a NON-BUNDLED name
// lands in the tarball and kills `dsh plugin add` in the profile workspace
// (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND). Bundled names are fine — npm packs
// their physical copies into the tarball, so the range never resolves for a
// consumer. Workspace helpers (e.g. vendor/sqlite-island) are reached by
// relative import instead of a manifest entry.
const bundled = new Set(manifest.bundledDependencies ?? manifest.bundleDependencies ?? [])
for (const section of ['dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies']) {
  for (const [name, range] of Object.entries(manifest[section] ?? {})) {
    if (typeof range === 'string' && range.startsWith('workspace:') && !bundled.has(name)) {
      throw new Error(`manifest ${section}.${name} uses the ${range} protocol on a non-bundled package, which must never ship (reach workspace helpers by relative import)`)
    }
  }
}

// The website's settings reference reads this file from the exact published
// version; it must describe the version it ships in.
const settingsJson = JSON.parse(readFileSync(new URL('../lib/settings.json', import.meta.url), 'utf8'))
if (settingsJson.schemaVersion !== 1 || settingsJson.packageVersion !== manifest.version) {
  throw new Error(`lib/settings.json is stale (schemaVersion ${settingsJson.schemaVersion}, packageVersion ${settingsJson.packageVersion}, manifest ${manifest.version}); rerun pnpm compile`)
}
// …and exactly what the compiled definitions produce (same version, edited text).
const settingsCheck = spawnSync(process.execPath, [fileURLToPath(new URL('./gen-settings-json.mjs', import.meta.url)), '--check'], { encoding: 'utf8' })
if (settingsCheck.status !== 0) throw new Error(settingsCheck.stderr.trim() || 'lib/settings.json check failed')

await import(new URL(`../${manifest.main}`, import.meta.url))
const invariant = await import(new URL('../lib/types/dsh-adapter/invariant.js', import.meta.url))
if (invariant.name !== 'flagqai-invariant' || typeof invariant.apply !== 'function') {
  throw new Error('compiled invariant entry does not expose the expected contract')
}

console.log(`package surface OK (${packed.size} files, ${targets.size} entry targets)`)
