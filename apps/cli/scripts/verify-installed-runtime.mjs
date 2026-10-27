import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { requireSupportedNode, requireUvTorchBackendSupport, installedPaths, inspectInstalledRuntime, packInstalledCli, setupInstalledRuntime, useInstalledRuntime, checkManagedQuantumDiskSpace, installManagedQuantum, INSTALLED_RUNTIME } from '../bin/installed-runtime.js'
import { resolveNpmCli } from './npm-cli.mjs'
import { parse } from 'yaml'
import { FLAGQUANTUM_MCP_INSTALL_ARGS, FLAGQUANTUM_MCP_INSTALL_ID, FLAGQUANTUM_MCP_PACKAGE } from '../bin/quantum-mcp-profile.js'

const profilePins = JSON.parse(await readFile(new URL('../bin/runtime-profile-overrides.json', import.meta.url), 'utf8'))
const sourcePins = parse(await readFile(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8')).overrides
const harnessCohort = Object.fromEntries(Object.keys(profilePins).map(name => [name, sourcePins[name]]))
assert.deepEqual(profilePins, harnessCohort, 'installed peer resolution must match the verified source Harness cohort, including published-version exceptions')
assert.equal(profilePins['@deepseek-ai/dsh-invariants'], '0.2.0-rc.2', 'invariants has no published 0.2.1 build')

for (const value of ['22.19.0', '22.20.0', '24.0.0', '26.8.2']) requireSupportedNode(value)
for (const value of ['18.20.0', '22.18.0', '23.0.0']) assert.throws(() => requireSupportedNode(value), /requires Node.js/)
requireUvTorchBackendSupport('      --torch-backend <TORCH_BACKEND>')
assert.throws(() => requireUvTorchBackendSupport('Usage: uv tool install <PACKAGE>'),
  /needs uv with `uv tool install --torch-backend` support/)
const sandbox = await mkdtemp(join(tmpdir(), 'flagqai-setup-test-'))
try {
  const packSource = join(sandbox, 'repack-source')
  const packOutput = join(sandbox, 'repack-output')
  const packInstall = join(sandbox, 'repack-install')
  await mkdir(join(packSource, 'bin'), { recursive: true })
  await mkdir(join(packSource, 'lib'), { recursive: true })
  await mkdir(packOutput)
  await mkdir(packInstall)
  const sourceManifest = { name: '@flagqai/repack-test', version: '0.1.0', files: ['bin', 'lib'], bundledDependencies: [], scripts: { prepare: 'exit 91' } }
  await writeFile(join(packSource, 'package.json'), JSON.stringify(sourceManifest))
  await writeFile(join(packSource, 'LICENSE'), 'fixture license')
  await writeFile(join(packSource, 'README.md'), 'fixture readme')
  await writeFile(join(packSource, 'bin', 'flagqai.js'), 'console.log("fixture")')
  await writeFile(join(packSource, 'lib', 'index.js'), 'export const ready = true')
  const packEnv = { ...process.env, npm_config_cache: join(sandbox, 'npm-cache') }
  const repacked = await packInstalledCli({ ownRoot: packSource, destination: packOutput, env: packEnv })
  assert.deepEqual(JSON.parse(await readFile(join(packSource, 'package.json'), 'utf8')), sourceManifest, 'repacking must not mutate the installed package')
  execFileSync(process.execPath, [resolveNpmCli(), 'install', repacked, '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], { cwd: packInstall, env: packEnv, stdio: 'pipe' })
  const installedManifest = JSON.parse(await readFile(join(packInstall, 'node_modules', '@flagqai', 'repack-test', 'package.json'), 'utf8'))
  assert.equal(installedManifest.scripts.prepare, undefined, 'the repacked profile must not contain the source-only prepare hook')
  assert.equal(await readFile(join(packInstall, 'node_modules', '@flagqai', 'repack-test', 'lib', 'index.js'), 'utf8'), 'export const ready = true')
  const root = join(sandbox, 'managed')
  const env = { FLAGQAI_CLI_RUNTIME_ROOT: root }
  const versionRoot = join(sandbox, 'version-runtime')
  const versionPaths = installedPaths({ FLAGQAI_CLI_RUNTIME_ROOT: versionRoot })
  const versionEnv = { ...process.env, FLAGQAI_CLI_RUNTIME_ROOT: versionRoot }
  delete versionEnv.DSH_HOME
  const flagqaiEntry = fileURLToPath(new URL('../bin/flagqai.js', import.meta.url))
  const showVersion = (option, overrides = {}) => execFileSync(process.execPath, [flagqaiEntry, option], {
    env: { ...versionEnv, ...overrides }, encoding: 'utf8', stdio: 'pipe',
  })
  const beforeSetup = showVersion('--version')
  assert.ok(beforeSetup.includes(versionPaths.cli), 'version must inspect the managed profile path before setup')
  await mkdir(versionPaths.cli, { recursive: true })
  await writeFile(join(versionPaths.cli, 'package.json'), JSON.stringify({ name: '@flagqai/cli', version: '0.1.0' }))
  for (const option of ['--version', '-v', 'version']) {
    const output = showVersion(option)
    assert.ok(output.includes(`profile: 0.1.0  ${versionPaths.cli}`), `${option} must report the installed managed profile`)
  }
  const legacyHome = join(sandbox, 'explicit-dsh-home')
  const legacyCli = join(legacyHome, 'profiles', 'flagqai', 'node_modules', '@flagqai', 'cli')
  await mkdir(legacyCli, { recursive: true })
  await writeFile(join(legacyCli, 'package.json'), JSON.stringify({ name: '@flagqai/cli', version: '9.9.9' }))
  assert.ok(showVersion('--version', { DSH_HOME: legacyHome }).includes(`profile: 9.9.9  ${legacyCli}`),
    'an explicit DSH_HOME must continue to select the caller profile')
  const ownRoot = join(sandbox, 'package')
  await mkdir(join(ownRoot, 'lib', 'types'), { recursive: true })
  await mkdir(join(ownRoot, 'bin'), { recursive: true })
  await writeFile(join(ownRoot, 'package.json'), JSON.stringify({ name: '@flagqai/cli', version: '0.1.0', files: ['bin', 'lib'], bundledDependencies: [] }))
  await writeFile(join(ownRoot, 'LICENSE'), 'fixture license')
  await writeFile(join(ownRoot, 'README.md'), 'fixture readme')
  await writeFile(join(ownRoot, 'bin', 'flagqai.js'), 'console.log("fixture")')
  await writeFile(join(ownRoot, 'lib', 'types', 'index.js'), '')
  const paths = installedPaths(env)
  let fixtureDiskProbes = 0
  const ampleSpace = async () => { fixtureDiskProbes++; return { bavail: 4 * 1024 ** 3, bsize: 1 } }
  // Fixture installs should test setup behavior independently of the host's
  // remaining disk space; the real guard is exercised directly below.
  const setupWithAmpleDisk = options => setupInstalledRuntime({ ...options, probeDisk: ampleSpace })
  await checkManagedQuantumDiskSpace(paths, ampleSpace)
  await assert.rejects(checkManagedQuantumDiskSpace(paths, async directory => ({
    bavail: directory === paths.quantumCache ? 1024 ** 3 : 4 * 1024 ** 3, bsize: 1,
  })), error => error.message.includes(paths.quantumCache) && error.message.includes('FLAGQAI_CLI_RUNTIME_ROOT'))
  await assert.rejects(checkManagedQuantumDiskSpace(paths, async () => { throw new Error('probe failed') }),
    /Cannot check free disk space/)
  if (process.platform === 'linux') {
    const oldUvCalls = []
    await assert.rejects(installManagedQuantum({ paths, env, probeDisk: ampleSpace,
      execute: async (_command, args) => {
        oldUvCalls.push(args)
        return args[0] === '--version' ? 'uv 0.9.6' : 'Usage: uv tool install <PACKAGE>'
      },
    }), /needs uv with `uv tool install --torch-backend` support/)
    assert.deepEqual(oldUvCalls, [['--version'], ['tool', 'install', '--help']],
      'unsupported uv must stop before downloading the MCP')
  }
  let diskProbes = 0
  let installAborted = false
  await assert.rejects(installManagedQuantum({ paths, env, diskCheckIntervalMs: 5,
    probeDisk: async () => ({ bavail: ++diskProbes > 4 ? 1024 ** 3 : 4 * 1024 ** 3, bsize: 1 }),
    execute: async (_command, args, options) => {
      if (args[0] === '--version') return 'uv fixture'
      if (args.at(-1) === '--help') return '--torch-backend <TORCH_BACKEND>'
      await new Promise((_, reject) => options.signal.addEventListener('abort', () => {
        installAborted = true
        reject(new Error('aborted'))
      }, { once: true }))
    },
  }), /Less than 2 GiB is free/)
  assert.equal(installAborted, true, 'the running uv install must stop when free space falls below the floor')
  assert.equal((await inspectInstalledRuntime({ env, ownRoot })).ready, false)
  await assert.rejects(useInstalledRuntime(env), /flagqai setup/)
  const legacy = { DSH_HOME: join(sandbox, 'legacy'), PATH: '/legacy/bin' }
  assert.equal(await useInstalledRuntime(legacy), false)
  assert.equal(legacy.PATH, '/legacy/bin', 'explicit legacy profile must remain untouched')
  await mkdir(paths.dshHome, { recursive: true })
  const secret = join(paths.dshHome, '.credentials.yaml')
  await writeFile(secret, 'fixture credential sentinel')
  await assert.rejects(setupWithAmpleDisk({ env, ownRoot, execute: async () => { throw new Error('offline fixture') } }), /offline fixture/)
  const runtimeManifest = JSON.parse(await readFile(join(paths.runtime, 'package.json'), 'utf8'))
  assert.equal(runtimeManifest.overrides['@deepseek-ai/cordis-plugin-loader'], '1.0.6', 'npm setup must use the validated 0.2.1 cohort')
  assert.equal(runtimeManifest.overrides['@deepseek-ai/cordis-plugin-include'], '1.0.10')
  assert.equal(await readFile(secret, 'utf8'), 'fixture credential sentinel', 'failed setup must retain credentials')
  // Failure releases the lock and a conflicting installer must not execute.
  await mkdir(join(root, '.setup-lock'))
  let executed = false
  await assert.rejects(setupWithAmpleDisk({ env, ownRoot, execute: async () => { executed = true } }), /Another setup owns/)
  assert.equal(executed, false)
  await rm(join(root, '.setup-lock'), { recursive: true })
  await assert.rejects(setupWithAmpleDisk({ env, ownRoot, execute: async () => { throw new Error('retry fixture') } }), /retry fixture/)
  assert.equal(await readFile(secret, 'utf8'), 'fixture credential sentinel')
  for (const [directory, value] of [
    [join(paths.runtime, 'node_modules', '@deepseek-ai', 'dsh'), INSTALLED_RUNTIME.dsh],
    [join(paths.runtime, 'node_modules', 'pnpm'), INSTALLED_RUNTIME.pnpm],
    [join(paths.runtime, 'node_modules', '@deepseek-ai', 'cordis-plugin-loader'), '1.0.6'],
    [join(paths.runtime, 'node_modules', '@deepseek-ai', 'cordis-plugin-include'), '1.0.10'],
    [paths.cli, '0.1.0'],
  ]) {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ version: value }))
  }
  await mkdir(paths.bin, { recursive: true })
  await writeFile(join(paths.bin, process.platform === 'win32' ? 'dsh.cmd' : 'dsh'), '')
  await mkdir(join(paths.cli, 'lib', 'types'), { recursive: true })
  await writeFile(join(paths.cli, 'lib', 'types', 'index.js'), '')
  await mkdir(paths.quantumToolDir, { recursive: true })
  await mkdir(paths.quantumBinDir, { recursive: true })
  await writeFile(paths.quantumExecutable, '')
  if (process.platform === 'linux') {
    await writeFile(paths.quantumMarker, `${FLAGQUANTUM_MCP_PACKAGE}\n`)
    assert.equal((await inspectInstalledRuntime({ env, ownRoot })).quantumReady, false,
      'an earlier Linux GPU-resolved install must be replaced by the CPU cohort')
  }
  await writeFile(paths.quantumMarker, `${FLAGQUANTUM_MCP_INSTALL_ID}\n`)
  const loaderManifest = join(paths.runtime, 'node_modules', '@deepseek-ai', 'cordis-plugin-loader', 'package.json')
  await writeFile(loaderManifest, '{"version":"1.0.5"}')
  assert.equal((await inspectInstalledRuntime({ env, ownRoot })).ready, false, 'a stale dependency graph must not be accepted as ready')
  let retriedRuntime = false
  await assert.rejects(setupWithAmpleDisk({ env, ownRoot, execute: async (command, args) => {
    retriedRuntime = command === 'npm' && args[0] === 'install'
    throw new Error('runtime repair fixture')
  } }), /runtime repair fixture/)
  assert.equal(retriedRuntime, true, 'retry must repair runtime dependencies even when Harness and pnpm versions already match')
  await writeFile(loaderManifest, '{"version":"1.0.6"}')
  const ready = await setupWithAmpleDisk({ env, ownRoot, execute: async () => { throw new Error('ready setup must not install') } })
  assert.equal(ready.ready, true)
  assert.equal(await readFile(secret, 'utf8'), 'fixture credential sentinel', 'ready setup must retain credentials')
  const refreshed = []
  const workspacePath = join(paths.profile, 'pnpm-workspace.yaml')
  await writeFile(workspacePath, '# Preserve user settings\npackages:\n  - .\nminimumReleaseAge: 60\noverrides:\n  unrelated-package: 2.0.0\n')
  await setupWithAmpleDisk({ env, ownRoot, refresh: true, execute: async (command, args, options) => {
    refreshed.push({ command, args })
    if (command === 'npm' && args[0] === 'pack') {
      return execFileSync(process.execPath, [resolveNpmCli(), ...args], { cwd: options.cwd, env: options.env, encoding: 'utf8' })
    }
    if (command.endsWith(process.platform === 'win32' ? 'dsh.cmd' : 'dsh') && args[0] === 'plugin') {
      await cp(join(paths.packages, `.cli-refresh-backup-${process.pid}`), paths.cli, { recursive: true })
      return ''
    }
    throw new Error(`Unexpected refresh command: ${command} ${args.join(' ')}`)
  } })
  assert.deepEqual(refreshed.map(call => call.args[0]), ['pack', 'plugin'], 'same-version refresh must repack and reinstall only the CLI profile')
  assert.ok(refreshed[1].args.includes('--force'), 'same-version refresh must force pnpm to replace the cached profile package')
  assert.equal(await readFile(secret, 'utf8'), 'fixture credential sentinel', 'refresh must retain credentials')
  const workspaceText = await readFile(workspacePath, 'utf8')
  const workspace = parse(workspaceText)
  assert.equal(workspace.overrides['@deepseek-ai/cordis-plugin-loader'], '1.0.6', 'profile pnpm installation needs the same compatibility pin')
  assert.equal(workspace.overrides['@deepseek-ai/cordis-plugin-include'], '1.0.10')
  assert.equal(workspace.overrides['@deepseek-ai/dsh-scope'], INSTALLED_RUNTIME.dsh, 'auto-installed peers must not select an unavailable stable scope range')
  for (const [name, version] of Object.entries(profilePins)) assert.equal(workspace.overrides[name], version)
  assert.equal(workspace.overrides['unrelated-package'], '2.0.0', 'unrelated overrides must survive refresh')
  assert.equal(workspace.minimumReleaseAge, 60, 'other profile settings must survive refresh')
  assert.match(workspaceText, /Preserve user settings/, 'workspace comments must survive refresh')
  await writeFile(workspacePath, 'overrides: invalid\n')
  await assert.rejects(setupWithAmpleDisk({ env, ownRoot, refresh: true, execute: async (command, args, options) => {
    if (command === 'npm' && args[0] === 'pack') {
      return execFileSync(process.execPath, [resolveNpmCli(), ...args], { cwd: options.cwd, env: options.env, encoding: 'utf8' })
    }
    throw new Error('invalid profile workspace must stop before plugin installation')
  } }), /Profile overrides must be a YAML mapping/)
  assert.equal(await readFile(workspacePath, 'utf8'), 'overrides: invalid\n', 'invalid user configuration must not be overwritten')
  await writeFile(workspacePath, workspaceText)
  await assert.rejects(setupWithAmpleDisk({ env, ownRoot, refresh: true, execute: async (command, args, options) => {
    if (command === 'npm' && args[0] === 'pack') {
      return execFileSync(process.execPath, [resolveNpmCli(), ...args], { cwd: options.cwd, env: options.env, encoding: 'utf8' })
    }
    throw new Error('profile refresh fixture failed')
  } }), /profile refresh fixture failed/)
  assert.equal(await readFile(join(paths.cli, 'lib', 'types', 'index.js'), 'utf8'), '', 'failed refresh must restore the previous CLI profile')
  assert.equal(await readFile(secret, 'utf8'), 'fixture credential sentinel', 'failed refresh must retain credentials')
  const quantum = { ...env, PATH: '', FLAGQAI_PRESET: 'flagquantum' }
  assert.equal(await useInstalledRuntime(quantum), true)
  assert.equal(quantum.FLAGQAI_MANAGED_MCP_EXECUTABLE, paths.quantumExecutable)
  await rm(paths.quantumMarker)
  const missingQuantum = { ...env, PATH: '', FLAGQAI_PRESET: 'flagquantum' }
  await assert.rejects(useInstalledRuntime(missingQuantum), /Run `flagqai setup`/)
  assert.equal(missingQuantum.DSH_HOME, undefined, 'missing quantum tooling must fail before changing the launch environment')
  await assert.rejects(setupWithAmpleDisk({ env, ownRoot, execute: async () => { throw new Error('Cannot run uv: ENOENT') } }),
    /setup needs uv to install the pinned FlagQuantum MCP/)
  let deniedChecks = 0
  await assert.rejects(setupWithAmpleDisk({ env, ownRoot, execute: async () => {
    deniedChecks++
    throw new Error('uv failed (exit 9): temporary process limit')
  } }), /could not run uv --version after three attempts: uv failed \(exit 9\): temporary process limit/)
  assert.equal(deniedChecks, 3, 'a persistent non-missing uv failure must retain its real cause after bounded retries')
  assert.equal((await inspectInstalledRuntime({ env, ownRoot })).quantumReady, false)
  const quantumCalls = []
  const probesBeforeRepair = fixtureDiskProbes
  const repaired = await setupWithAmpleDisk({ env, ownRoot, execute: async (command, args, options) => {
    quantumCalls.push({ command, args, options })
    if (command === 'uv' && args.at(-1) === '--help') return '--torch-backend <TORCH_BACKEND>'
    if (command === 'uv' && args[0] === 'tool') {
      await writeFile(paths.quantumExecutable, '')
      return ''
    }
    if (command === 'uv' && args[0] === '--version') {
      if (quantumCalls.length === 1) throw new Error('uv failed (exit 9): temporary process limit')
      return 'uv fixture'
    }
    throw new Error('ready Harness must not be repacked while repairing MCP')
  } })
  assert.ok(fixtureDiskProbes > probesBeforeRepair, 'MCP repair uses the fixture disk probe')
  assert.equal(repaired.quantumReady, true)
  assert.deepEqual(quantumCalls.map(call => call.args[0]), ['--version', '--version', ...(process.platform === 'linux' ? ['tool'] : []), 'tool'])
  const installCall = quantumCalls.at(-1)
  assert.deepEqual(installCall.args, FLAGQUANTUM_MCP_INSTALL_ARGS)
  assert.equal(await readFile(paths.quantumMarker, 'utf8'), `${FLAGQUANTUM_MCP_INSTALL_ID}\n`)
  assert.equal(installCall.options.env.UV_TOOL_BIN_DIR, paths.quantumBinDir)
  assert.equal(installCall.options.env.UV_PYTHON_INSTALL_DIR, paths.quantumPythonDir)
  const standard = { ...env, PATH: '' }
  assert.equal(await useInstalledRuntime(standard), true, 'Standard must remain usable without uv')
  assert.equal(standard.DSH_HOME, paths.dshHome)
  console.log('PASS installed runtime: source-only prepare stripped from a clean repack, supported Node, pinned source/runtime versions, missing setup, explicit legacy profile, failed-install credential preservation, installer lock cleanup, ready-setup preservation, same-version profile refresh, and optional quantum tooling')
} finally { await rm(sandbox, { recursive: true, force: true }) }
