import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, cp, mkdir, mkdtemp, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveNpmCli } from './npm-cli.js'
import { isMap, parseDocument } from 'yaml'
import harnessOverrides from './runtime-profile-overrides.json' with { type: 'json' }
import { FLAGQUANTUM_MCP_INSTALL_ARGS, FLAGQUANTUM_MCP_INSTALL_ID, FLAGQUANTUM_MCP_PACKAGE, FLAGQUANTUM_MCP_TORCH_ARGS } from './quantum-mcp-profile.js'

export const INSTALLED_RUNTIME = { dsh: '0.2.1-rc.2', pnpm: '11.26.0' }
// Match the source lockfile and the validated 0.2.1 candidate cohort.
const COMPATIBILITY_OVERRIDES = {
  '@deepseek-ai/cordis-plugin-loader': '1.0.6',
  '@deepseek-ai/cordis-plugin-include': '1.0.10',
}
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const MIN_QUANTUM_FREE_BYTES = 2 * 1024 ** 3
const QUANTUM_DISK_CHECK_MS = 5000
const version = async path => {
  try { return JSON.parse(await readFile(path, 'utf8')).version }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}
const compiledEntry = 'index.js'
export function requireSupportedNode(value = process.versions.node) {
  const [major, minor] = value.split('.').map(Number)
  if (!(major >= 24 || major === 22 && minor >= 19)) throw new Error('FlagQAI requires Node.js 22.19 or Node.js 24+. Install a supported Node.js version, then retry.')
}
export function requireUvTorchBackendSupport(help) {
  if (!help.includes('--torch-backend')) {
    throw new Error('FlagQAI setup on Linux needs uv with `uv tool install --torch-backend` support (verified with uv 0.12.16). Upgrade uv, then retry `flagqai setup`.')
  }
}
export function installedPaths(env = process.env, home = homedir()) {
  const root = resolve(env.FLAGQAI_CLI_RUNTIME_ROOT || join(home, '.flagqai', 'cli'))
  const runtime = join(root, 'runtime')
  const dshHome = join(root, 'dsh')
  const profile = join(dshHome, 'profiles', 'flagqai')
  return { root, runtime, dshHome, profile, packages: join(root, 'packages'), cache: join(root, 'npm-cache'),
    quantumToolDir: join(root, 'quantum-tools'), quantumBinDir: join(root, 'quantum-bin'),
    quantumCache: join(root, 'uv-cache'), quantumPythonDir: join(root, 'uv-python'),
    quantumExecutable: join(root, 'quantum-bin', process.platform === 'win32' ? 'flagquantum-mcp-server.exe' : 'flagquantum-mcp-server'),
    quantumMarker: join(root, 'quantum-tools', '.flagqai-version'),
    bin: join(runtime, 'node_modules', '.bin'), cli: join(profile, 'node_modules', '@flagqai', 'cli') }
}
export async function inspectInstalledRuntime({ env = process.env, ownRoot = packageRoot, home } = {}) {
  const paths = installedPaths(env, home)
  const ownVersion = await version(join(ownRoot, 'package.json'))
  const dshVersion = await version(join(paths.runtime, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
  const cliVersion = await version(join(paths.cli, 'package.json'))
  const pnpmVersion = await version(join(paths.runtime, 'node_modules', 'pnpm', 'package.json'))
  const compatibilityReady = (await Promise.all(Object.entries(COMPATIBILITY_OVERRIDES).map(async ([name, expected]) =>
    await version(join(paths.runtime, 'node_modules', ...name.split('/'), 'package.json')) === expected))).every(Boolean)
  const artifacts = await Promise.all([join(paths.bin, process.platform === 'win32' ? 'dsh.cmd' : 'dsh'),
    join(paths.cli, 'lib', 'types', compiledEntry)].map(path => access(path).then(() => true, () => false)))
  const quantumVersion = await readFile(paths.quantumMarker, 'utf8').then(value => value.trim(), error => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  const quantumExecutablePresent = await access(paths.quantumExecutable).then(() => true, () => false)
  return { ...paths, ownVersion, dshVersion, cliVersion, pnpmVersion, compatibilityReady,
    quantumReady: quantumVersion === FLAGQUANTUM_MCP_INSTALL_ID && quantumExecutablePresent,
    ready: compatibilityReady && artifacts.every(Boolean) &&
      pnpmVersion === INSTALLED_RUNTIME.pnpm && ownVersion !== undefined &&
      dshVersion === INSTALLED_RUNTIME.dsh && cliVersion === ownVersion }
}

export async function checkManagedQuantumDiskSpace(paths, probe = statfs) {
  for (const directory of [paths.quantumToolDir, paths.quantumBinDir, paths.quantumCache, paths.quantumPythonDir]) {
    let free
    try {
      const { bavail, bsize } = await probe(directory)
      free = Number(bavail) * Number(bsize)
    } catch {
      throw new Error(`Cannot check free disk space for FlagQuantum MCP setup at ${directory}. Check the filesystem and retry.`)
    }
    if (!Number.isFinite(free) || free < MIN_QUANTUM_FREE_BYTES) {
      throw new Error(`Less than 2 GiB is free for FlagQuantum MCP setup at ${directory}. Free disk space or set FLAGQAI_CLI_RUNTIME_ROOT to a volume with more space, then retry.`)
    }
  }
}

export async function installManagedQuantum({ paths, env, execute, probeDisk = statfs, diskCheckIntervalMs = QUANTUM_DISK_CHECK_MS }) {
  await Promise.all([paths.quantumToolDir, paths.quantumBinDir, paths.quantumCache, paths.quantumPythonDir]
    .map(path => mkdir(path, { recursive: true, mode: 0o700 })))
  // `UV_PYTHON_INSTALL_DIR` alone does not keep the interpreter inside this
  // runtime: when a suitable 3.12 is already on PATH, uv links the tool to that
  // one instead of downloading into the pinned directory, and the installed
  // `bin/python` then points outside the managed tree. `UV_MANAGED_PYTHON`
  // requires a uv-managed interpreter, so a first setup downloads 3.12 into
  // `paths.quantumPythonDir` and the runtime stays self-contained.
  const installEnv = { ...env, UV_TOOL_DIR: paths.quantumToolDir, UV_TOOL_BIN_DIR: paths.quantumBinDir,
    UV_CACHE_DIR: paths.quantumCache, UV_PYTHON_INSTALL_DIR: paths.quantumPythonDir,
    UV_MANAGED_PYTHON: '1' }
  let uvVersionError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await execute('uv', ['--version'], { cwd: paths.root, env: installEnv, capture: true })
      uvVersionError = undefined
      break
    } catch (error) {
      uvVersionError = error
      const detail = error instanceof Error ? error.message : String(error)
      if (error?.code === 'ENOENT' || /\bENOENT\b/.test(detail) || attempt === 2) break
      process.stderr.write(`Retrying uv availability check (${attempt + 2}/3)...\n`)
      await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
    }
  }
  if (uvVersionError) {
    const detail = uvVersionError instanceof Error ? uvVersionError.message : String(uvVersionError)
    if (uvVersionError?.code === 'ENOENT' || /\bENOENT\b/.test(detail)) {
      throw new Error('FlagQAI setup needs uv to install the pinned FlagQuantum MCP. Install uv from https://docs.astral.sh/uv/getting-started/installation/ and retry.')
    }
    throw new Error(`FlagQAI setup could not run uv --version after three attempts: ${detail}`)
  }
  if (FLAGQUANTUM_MCP_TORCH_ARGS.length > 0) {
    const help = await execute('uv', ['tool', 'install', '--help'], { cwd: paths.root, env: installEnv, capture: true })
    requireUvTorchBackendSupport(help)
  }
  await checkManagedQuantumDiskSpace(paths, probeDisk)
  process.stderr.write(`Installing ${FLAGQUANTUM_MCP_PACKAGE} into the managed FlagQAI runtime...\n`)
  const controller = new AbortController()
  let diskFailure
  let checking = false
  let activeCheck = Promise.resolve()
  const monitor = setInterval(() => {
    if (checking || controller.signal.aborted) return
    checking = true
    activeCheck = checkManagedQuantumDiskSpace(paths, probeDisk)
      .catch(error => { diskFailure = error; controller.abort() })
      .finally(() => { checking = false })
  }, diskCheckIntervalMs)
  let installError
  try {
    await execute('uv', FLAGQUANTUM_MCP_INSTALL_ARGS, {
      cwd: paths.root, env: installEnv, signal: controller.signal,
    })
  } catch (error) {
    installError = error
  } finally {
    clearInterval(monitor)
    await activeCheck
  }
  if (diskFailure) throw diskFailure
  if (installError) throw installError
  await access(paths.quantumExecutable).catch(() => { throw new Error('FlagQuantum MCP installation did not create its executable. Retry flagqai setup.') })
  const temporary = `${paths.quantumMarker}.${process.pid}.tmp`
  try {
    await writeFile(temporary, `${FLAGQUANTUM_MCP_INSTALL_ID}\n`, { mode: 0o600, flag: 'wx' })
    await rename(temporary, paths.quantumMarker)
  } finally { await rm(temporary, { force: true }) }
}
const run = (command, args, { capture = false, ...options } = {}) => new Promise((resolve, reject) => {
  const quote = value => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
  const npmOnWindows = process.platform === 'win32' && command === 'npm'
  let invocation
  try {
    invocation = npmOnWindows ? [process.execPath, [resolveNpmCli(), ...args]]
      : process.platform === 'win32' ? [quote(command) + ' ' + args.map(quote).join(' '), []]
        : [command, args]
  } catch (error) { reject(error); return }
  const child = spawn(...invocation, { ...options, shell: process.platform === 'win32' && !npmOnWindows, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
  let output = '', errors = ''
  child.stdout?.on('data', chunk => { output += chunk })
  child.stderr?.on('data', chunk => { errors = (errors + chunk).slice(-4000) })
  child.once('error', error => reject(new Error(`Cannot run ${command}: ${error.code}. Check that ${command} is installed, then retry flagqai setup.`)))
  child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`${command} failed (exit ${code}); retry flagqai setup.${capture ? ` ${errors}` : ''}`)))
})

/** npm 10 still runs prepare during `npm pack --ignore-scripts`. The distributed
 * package has no build scripts, so repack an isolated copy without that hook. */
export async function packInstalledCli({ ownRoot, destination, env, execute = run }) {
  const manifest = JSON.parse(await readFile(join(ownRoot, 'package.json'), 'utf8'))
  const stage = await mkdtemp(join(destination, 'repack-'))
  try {
    const { prepare: _sourceOnlyPrepare, ...scripts } = manifest.scripts ?? {}
    await writeFile(join(stage, 'package.json'), JSON.stringify({ ...manifest, scripts }, null, 2) + '\n')
    for (const entry of ['LICENSE', 'README.md', ...manifest.files.filter(name => !name.startsWith('!'))]) {
      await cp(join(ownRoot, entry), join(stage, entry), { recursive: true, dereference: true })
    }
    for (const name of manifest.bundledDependencies ?? []) {
      const target = join(stage, 'node_modules', name)
      await mkdir(dirname(target), { recursive: true })
      await cp(join(ownRoot, 'node_modules', name), target, { recursive: true, dereference: true })
    }
    const report = JSON.parse(await execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], { cwd: stage, env, capture: true }))[0]
    if (!report?.filename) throw new Error('npm pack did not produce a FlagQAI tarball')
    return join(destination, report.filename)
  } finally { await rm(stage, { recursive: true, force: true }) }
}

async function pinProfileDependencies(profile) {
  const path = join(profile, 'pnpm-workspace.yaml')
  let text = ''
  try { text = await readFile(path, 'utf8') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const document = parseDocument(text)
  if (document.errors.length) throw new Error(`Invalid profile workspace: ${document.errors[0].message}`)
  if (document.contents === null) document.contents = document.createNode({})
  if (!isMap(document.contents)) throw new Error('Profile workspace must be a YAML mapping')
  const overrides = document.get('overrides', true)
  if (overrides !== undefined && !isMap(overrides)) throw new Error('Profile overrides must be a YAML mapping')
  // Profile installation auto-resolves peers independently of the npm runtime.
  // Keep its Harness cohort identical to the source build, including scope.
  for (const [name, version] of Object.entries({ ...harnessOverrides, ...COMPATIBILITY_OVERRIDES })) {
    document.setIn(['overrides', name], version)
  }
  await mkdir(profile, { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  try {
    await writeFile(temporary, String(document), { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}

/** Explicit installation only: no credentials or legacy DSH profiles are copied. */
export async function setupInstalledRuntime({ env = process.env, ownRoot = packageRoot, home, execute = run, refresh = false, probeDisk = statfs } = {}) {
  requireSupportedNode()
  await access(join(ownRoot, 'lib', 'types', compiledEntry)).catch(() => {
    throw new Error('FlagQAI package has no compiled CLI service. Build the source before packing it.')
  })
  const paths = installedPaths(env, home)
  await mkdir(paths.root, { recursive: true, mode: 0o700 })
  const lock = join(paths.root, '.setup-lock')
  await mkdir(lock).catch(error => { throw new Error(error.code === 'EEXIST' ? `Another setup owns ${lock}. If it was interrupted, remove that empty lock directory before retrying.` : error.message) })
  try {
    const before = await inspectInstalledRuntime({ env, ownRoot, home })
    if (before.ready && before.quantumReady && !refresh) return before
    if (before.ready && !refresh) {
      await installManagedQuantum({ paths, env, execute, probeDisk })
      return inspectInstalledRuntime({ env, ownRoot, home })
    }
    await Promise.all([paths.runtime, paths.packages, paths.cache].map(path => mkdir(path, { recursive: true, mode: 0o700 })))
    const installEnv = { ...env, npm_config_cache: paths.cache }
    if (!before.compatibilityReady || before.dshVersion !== INSTALLED_RUNTIME.dsh || before.pnpmVersion !== INSTALLED_RUNTIME.pnpm) {
      await writeFile(join(paths.runtime, 'package.json'), JSON.stringify({ private: true, dependencies: {
        '@deepseek-ai/dsh': INSTALLED_RUNTIME.dsh, pnpm: INSTALLED_RUNTIME.pnpm,
      }, overrides: COMPATIBILITY_OVERRIDES,
      allowScripts: { '@deepseek-ai/dsh-subprocess-local@0.2.1-rc.2': true, '@google/genai@2.21.0': true, 'koffi@3.1.1': true, 'node-pty@1.2.0-beta.15': true, 'protobufjs@7.6.6': true } }, null, 2) + '\n')
      process.stderr.write(`Installing Harness ${INSTALLED_RUNTIME.dsh} and local pnpm (first run may take several minutes)...\n`)
      await execute('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: paths.runtime, env: installEnv })
    }
    // Repack the installed package, never fetch @flagqai/cli from the registry.
    process.stderr.write('Packing the installed FlagQAI package...\n')
    const tarball = await packInstalledCli({ ownRoot, destination: paths.packages, env: installEnv, execute })
    const digest = createHash('sha256').update(await readFile(tarball)).digest('hex').slice(0, 12)
    const addressed = join(paths.packages, `flagqai-cli-${digest}.tgz`)
    await writeFile(addressed, await readFile(tarball))
    const childEnv = { ...installEnv, DSH_HOME: paths.dshHome, PATH: `${paths.bin}${delimiter}${env.PATH ?? ''}` }
    const executable = name => join(paths.bin, process.platform === 'win32' ? `${name}.cmd` : name)
    await pinProfileDependencies(paths.profile)
    process.stderr.write('Installing the native FlagQAI profile...\n')
    // pnpm can leave an existing same-version tarball untouched even with
    // --force. Move only the CLI package aside so it must be reified; keep a
    // rollback copy until the new profile has passed its readiness check.
    const backup = refresh && await access(paths.cli).then(() => join(paths.packages, `.cli-refresh-backup-${process.pid}`), () => undefined)
    if (backup) await rename(paths.cli, backup)
    try {
      await execute(executable('dsh'), ['plugin', '--profile', 'flagqai', 'add', '-w', ...(refresh ? ['--force'] : []), addressed], { cwd: paths.root, env: childEnv })
      const status = await inspectInstalledRuntime({ env, ownRoot, home })
      if (!status.ready) throw new Error('FlagQAI setup is incomplete. Retry flagqai setup; existing sessions and credentials are retained.')
      if (!status.quantumReady) await installManagedQuantum({ paths, env, execute, probeDisk })
      if (backup) await rm(backup, { recursive: true, force: true })
      return inspectInstalledRuntime({ env, ownRoot, home })
    } catch (error) {
      if (backup) {
        await rm(paths.cli, { recursive: true, force: true })
        await rename(backup, paths.cli)
      }
      throw error
    }
  } finally { await rm(lock, { recursive: true, force: true }) }
}

/** Prepare the existing launcher, preserving its resume/workspace/key behavior. */
export async function useInstalledRuntime(env = process.env) {
  requireSupportedNode()
  if (env.DSH_HOME !== undefined) return false // Explicit legacy/source profile wins.
  const status = await inspectInstalledRuntime({ env })
  if (!status.ready) throw new Error('FlagQAI runtime is not ready. Run `flagqai setup` once, then retry. Setup installs the pinned Harness locally; no global dsh is required.')
  if ((env.FLAGQAI_PRESET === 'flagquantum' || env.FLAGQAI_ENABLE_FLAGQUANTUM_MCP === '1') && !status.quantumReady) {
    throw new Error('FlagQuantum MCP is not installed in the managed runtime. Run `flagqai setup` once, then retry. Set FLAGQAI_ENABLE_FLAGQUANTUM_MCP=0 only for a Standard-only session.')
  }
  env.DSH_HOME = status.dshHome
  env.PATH = `${status.bin}${delimiter}${env.PATH ?? ''}`
  if (status.quantumReady) env.FLAGQAI_MANAGED_MCP_EXECUTABLE = status.quantumExecutable
  return true
}

export async function installedDoctor({ env = process.env, write = text => process.stdout.write(text) } = {}) {
  requireSupportedNode()
  const status = await inspectInstalledRuntime({ env })
  write(`FlagQAI managed runtime: ${status.ready ? 'ready' : 'not ready'}\n`)
  write(`Harness: ${status.dshVersion ?? 'missing'} (expected ${INSTALLED_RUNTIME.dsh})\n`)
  write(`Profile: ${status.profile}\n`)
  if (!status.ready) write('Next: flagqai setup\n')
  write(`FlagQuantum MCP: ${status.quantumReady ? 'installed' : 'not installed; run flagqai setup'} (${FLAGQUANTUM_MCP_PACKAGE})\n`)
  write('Provider connectivity is not checked here. Use /setup in FlagQAI to configure and verify your provider.\n')
  return status.ready && status.quantumReady ? 0 : 1
}
