import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { installedPaths, inspectInstalledRuntime } from '../bin/installed-runtime.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const withHome = async fn => {
  const home = await mkdtemp(join(tmpdir(), 'flagqai-branding-'))
  try { await fn(home) } finally { await rm(home, { recursive: true, force: true }) }
}

test('new preferences do not read or migrate an existing old data directory', () => withHome(async home => {
  const oldDirectory = join(home, '.dsh-tui')
  await mkdir(oldDirectory)
  await writeFile(join(oldDirectory, 'model.json'), '{"model":"old-sentinel"}')
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import { DATA_DIR } from './lib/types/utils/paths.js'; console.log(DATA_DIR)"], {
    cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), join(home, '.flagqai'))
  assert.equal(await readFile(join(oldDirectory, 'model.json'), 'utf8'), '{"model":"old-sentinel"}')
  await assert.rejects(readFile(join(home, '.flagqai', 'model.json')), { code: 'ENOENT' })
}))

test('managed setup selects the FlagQAI profile and ignores an old installed profile', () => withHome(async home => {
  const paths = installedPaths({}, home)
  assert.equal(paths.profile, join(home, '.flagqai', 'cli', 'dsh', 'profiles', 'flagqai'))
  const oldProfile = join(paths.dshHome, 'profiles', 'dsh-tui', 'node_modules', '@flagqai', 'cli')
  await mkdir(oldProfile, { recursive: true })
  await writeFile(join(oldProfile, 'package.json'), '{"version":"0.1.0"}')
  const status = await inspectInstalledRuntime({ env: {}, home })
  assert.equal(status.cliVersion, undefined)
  assert.equal(status.ready, false)
  assert.equal(status.profile, paths.profile)
}))

test('only the new language variable controls the public launcher', () => {
  const env = { ...process.env, DSH_TUI_LANG: 'en' }
  delete env.FLAGQAI_LANG
  const invoke = environment => spawnSync(process.execPath, ['bin/flagqai.js', '--help'], {
    cwd: root, env: environment, encoding: 'utf8',
  })
  const defaultHelp = invoke(env)
  assert.equal(defaultHelp.status, 0, defaultHelp.stderr)
  assert.match(defaultHelp.stdout, /用法：flagqai\|fq/u)
  const english = invoke({ ...env, DSH_TUI_LANG: 'zh', FLAGQAI_LANG: 'en' })
  assert.equal(english.status, 0, english.stderr)
  assert.match(english.stdout, /Usage: flagqai\|fq/u)
  assert.doesNotMatch(english.stdout, /Legacy aliases|dsh-tui|\bdst\b/u)
})
