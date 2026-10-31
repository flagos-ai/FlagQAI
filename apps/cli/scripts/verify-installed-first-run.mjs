/** Fresh staged-package installation without a host profile or model endpoint. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { INSTALLED_RUNTIME, installedPaths } from '../bin/installed-runtime.js'
import { FLAGQUANTUM_MCP_PACKAGE } from '../bin/quantum-mcp-profile.js'
import { acceptanceRegistryEnvironment } from './acceptance-install-env.mjs'
import { removeAcceptanceSandbox } from './acceptance-cleanup.mjs'
import { packFlagqai } from './pack-flagqai.mjs'
import { resolveNpmCli } from './npm-cli.mjs'

const installTimeout = Number(process.env.FLAGQAI_ACCEPTANCE_INSTALL_TIMEOUT_MS ?? 600000)
if (!Number.isSafeInteger(installTimeout) || installTimeout < 1000 || installTimeout > 3600000) {
  throw new Error('FLAGQAI_ACCEPTANCE_INSTALL_TIMEOUT_MS must be an integer from 1000 to 3600000')
}

const sandbox = await mkdtemp(join(tmpdir(), 'flagqai-first-run-'))
const installation = join(sandbox, 'installation')
const home = join(sandbox, 'home')
const runtime = join(sandbox, 'runtime')
const env = Object.fromEntries([
  'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT',
].flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]]]))
Object.assign(env, acceptanceRegistryEnvironment(process.env))
Object.assign(env, {
  HOME: home,
  USERPROFILE: home,
  APPDATA: join(sandbox, 'appdata', 'roaming'),
  LOCALAPPDATA: join(sandbox, 'appdata', 'local'),
  XDG_CONFIG_HOME: join(sandbox, 'xdg-config'),
  XDG_DATA_HOME: join(sandbox, 'xdg-data'),
  XDG_CACHE_HOME: join(sandbox, 'xdg-cache'),
  FLAGQAI_CLI_RUNTIME_ROOT: runtime,
  npm_config_cache: process.env.FLAGQAI_ACCEPTANCE_NPM_CACHE ?? join(sandbox, 'npm-cache'),
  npm_config_userconfig: join(sandbox, 'empty-npmrc'),
  npm_config_globalconfig: join(sandbox, 'empty-global-npmrc'),
  DSH_TELEMETRY_DISABLED: '1',
  // `env` is an allowlist, so a diagnostic flag set by the workflow never
  // reaches the TUI unless it is forwarded here. Committing the trace without
  // this line cost a 21-minute run: the wizard's steps were written to stderr
  // and the harness's own log showed none of them.
  ...(process.env.FLAGQAI_DEBUG_PROVIDER_WIZARD === undefined
    ? {}
    : { FLAGQAI_DEBUG_PROVIDER_WIZARD: process.env.FLAGQAI_DEBUG_PROVIDER_WIZARD }),
})
let passed = false

function run(command, args, cwd, timeout = installTimeout) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.error?.code})\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

try {
  await Promise.all([installation, home, runtime, env.APPDATA, env.LOCALAPPDATA].map(path => mkdir(path, { recursive: true })))
  await writeFile(env.npm_config_userconfig, '')
  await writeFile(env.npm_config_globalconfig, '')
  await writeFile(join(installation, 'package.json'), '{"private":true}\n')
  const report = await packFlagqai({ destination: sandbox, env })
  console.log(`Acceptance tarball SHA-256: ${createHash('sha256').update(await readFile(report.path)).digest('hex')}; ${process.platform}/${process.arch} Node ${process.version}`)
  run(process.execPath, [resolveNpmCli(), 'install', report.path, '--omit=dev', '--omit=peer', '--no-audit', '--no-fund'], installation)
  const entry = join(installation, 'node_modules', '@flagqai', 'cli', 'bin', 'flagqai.js')
  const installedRoot = join(installation, 'node_modules', '@flagqai', 'cli')
  assert.equal(JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8')).private, true,
    'the staged preview must remain unpublished')
  const legacy = join(installedRoot, 'bin', 'native-launcher.js')
  const legacyBeforeSetup = spawnSync(process.execPath, [legacy], {
    cwd: installation, env, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(legacyBeforeSetup.status, 1, 'legacy alias must not bootstrap the private package from npm')
  assert.match(legacyBeforeSetup.stderr, /flagqai setup/u)
  const previewSafe = run(process.execPath, [legacy, 'safe'], installation)
  assert.match(previewSafe, /flagqai setup --refresh/u)
  assert.doesNotMatch(previewSafe, /(?:plugin --profile flagqai(?:-safe)? add|npm install -g)[^\n]*@flagqai\/cli@/u,
    'private preview safe mode must not recommend an unavailable registry package')
  const updateBeforeSetup = spawnSync(process.execPath, [entry, 'update'], {
    cwd: installation, env, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(updateBeforeSetup.status, 1, 'unpublished preview must reject registry self-update')
  assert.match(updateBeforeSetup.stderr, /flagqai setup/u)
  const help = run(process.execPath, [entry, '--help'], installation)
  assert.match(help, /flagqai setup/u)
  assert.match(help, /检查本地运行环境和 profile（不请求 Provider）/u)
  assert.doesNotMatch(help, /dsh\/pnpm\/profile\/密钥/u)
  const first = run(process.execPath, [entry, 'setup'], installation)
  assert.match(first, /FlagQAI runtime ready:/u)
  const updateAfterSetup = spawnSync(process.execPath, [entry, 'update'], {
    cwd: installation, env, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(updateAfterSetup.status, 1, 'unpublished preview must reject self-update even with a ready profile')
  assert.match(updateAfterSetup.stderr, /flagqai setup --refresh/u)
  // A Windows TEMP path can contain an 8.3 username. Node and the Harness
  // resolver must still share app-boot's module-local root Include registry.
  const identityProbe = join(installedRoot, 'verify-harness-module-identity.mjs')
  await writeFile(identityProbe, `
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installedPaths } from './bin/installed-runtime.js'
const paths = installedPaths()
const require = createRequire(join(paths.runtime, 'package.json'))
const boot = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
process.env.DSH_HOME = paths.dshHome
const { prepareProfile, INSTALL_ANCHOR } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh/profile-boot')).href)
const resolution = await boot.createRuntimeResolution({ installAnchor: INSTALL_ANCHOR, profile: prepareProfile('flagqai', false) })
const probe = join(paths.profile, 'verify-app-boot-identity.mjs')
const ctx = new Context()
try {
  await writeFile(probe, "export { reconcileProfilePatches } from '@deepseek-ai/dsh-app-boot'\\n")
  await ctx.plugin(boot.PluginPackages, { resolution })
  const profileBoot = await import(pathToFileURL(probe).href)
  assert.equal(profileBoot.reconcileProfilePatches, boot.reconcileProfilePatches,
    'profile edits must use the same app-boot module as Harness startup')
  console.log('PASS installed Harness module identity')
} finally {
  await ctx.fiber.dispose()
  await rm(probe, { force: true })
}
`)
  try {
    assert.match(run(process.execPath, [identityProbe], installation), /PASS installed Harness module identity/u)
    console.log('PASS installed Harness module identity')
  } finally { await rm(identityProbe, { force: true }) }
  const managedCli = join(runtime, 'dsh', 'profiles', 'flagqai', 'node_modules', '@flagqai', 'cli')
  const wrapProbe = join(managedCli, 'verify-installed-wrap.mjs')
  await writeFile(wrapProbe, `
import assert from 'node:assert/strict'
import React from 'react'
import Box from './lib/types/ink/components/Box.js'
import Text from './lib/types/ink/components/Text.js'
import { renderToScreen, scanPositions } from './lib/types/ink/render-to-screen.js'
for (const paragraphs of [1, 200]) {
  const text = Array(paragraphs).fill('abcd efgh ijkl mnop').join('\\n\\n') + '\\nLAST'
  const expectedRows = paragraphs * 5
  const result = renderToScreen(React.createElement(Box, { width: 8 }, React.createElement(Text, null, text)), 20)
  assert.equal(result.height, expectedRows)
  assert.deepEqual(scanPositions(result.screen, 'LAST'), [{ row: expectedRows - 1, col: 0, len: 4 }])
}
console.log('PASS installed renderer: whole-word row heights and long-message tail visibility')
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { panelStore } from './lib/types/components/sidePanel/PanelStore.js'
import { PanelCompactHost } from './lib/types/components/sidePanel/PanelCompactHost.js'
import { makePluginCompactComponent } from './lib/types/components/sidePanel/pluginPanelAdapter.js'
import { downloadAndReplaceStandaloneBinary } from './lib/types/update.js'
const id = 'installed:compact'
const dispose = panelStore.register({
  id, title: 'Fixture', source: 'plugin', component: () => null,
  compact: { maxRows: 2, component: makePluginCompactComponent(({ React: R, ui, width, badge }) => {
    const [label] = R.useState('COMPACT')
    return R.createElement(ui.Box, { flexDirection: 'column' },
      R.createElement(ui.Text, null, label + ':' + width + ':' + (badge?.unread ?? 0)),
      R.createElement(ui.Text, null, 'ROW2'), R.createElement(ui.Text, null, 'OVERFLOW'))
  }) },
}, { pluginId: 'installed' })
try {
  panelStore.setBadge(id, { level: 'info', unread: 7 })
  const result = renderToScreen(React.createElement(PanelCompactHost, { enabledPanelIds: [id], activePanelId: id, width: 38 }), 38)
  assert.equal(result.height, 2)
  assert.equal(scanPositions(result.screen, 'COMPACT:38:7').length, 1)
  assert.equal(scanPositions(result.screen, 'ROW2')[0].row, 1)
  assert.equal(scanPositions(result.screen, 'OVERFLOW').length, 0)
  const events = []
  const unsubscribe = panelStore.subscribe(event => events.push(event.type))
  panelStore.setView({ open: true, activePanelId: id, focus: 'panel' })
  panelStore.setView({ open: true, activePanelId: id, focus: 'panel' })
  panelStore.setView({ open: false, activePanelId: id, focus: 'chat' })
  unsubscribe()
  assert.deepEqual(events, ['sidebar-toggled', 'opened', 'focused', 'blurred', 'closed', 'sidebar-toggled'])
} finally { dispose() }
const scratch = mkdtempSync(join(tmpdir(), 'flagqai-installed-deadline-'))
const originalFetch = globalThis.fetch
const binaryBefore = process.env.FLAGQAI_STANDALONE_BINARY
const cacheBefore = process.env.FLAGQAI_STANDALONE_CACHE
try {
  const binary = join(scratch, 'flagqai')
  writeFileSync(binary, 'original')
  process.env.FLAGQAI_STANDALONE_BINARY = binary
  process.env.FLAGQAI_STANDALONE_CACHE = scratch
  globalThis.fetch = async (_url, options) => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array([1]))
    options.signal.addEventListener('abort', () => controller.error(options.signal.reason), { once: true })
  } }))
  const result = await downloadAndReplaceStandaloneBinary('https://example.invalid/fixture', undefined, undefined, { assetTimeoutMs: 30 })
  assert.equal(result.success, false)
  assert.match(result.error, /abort/i)
  assert.equal(readFileSync(binary, 'utf8'), 'original')
} finally {
  globalThis.fetch = originalFetch
  if (binaryBefore === undefined) delete process.env.FLAGQAI_STANDALONE_BINARY
  else process.env.FLAGQAI_STANDALONE_BINARY = binaryBefore
  if (cacheBefore === undefined) delete process.env.FLAGQAI_STANDALONE_CACHE
  else process.env.FLAGQAI_STANDALONE_CACHE = cacheBefore
  rmSync(scratch, { recursive: true, force: true })
}
console.log('PASS installed plugin panels and download deadline')
`)
  try {
    const output = run(process.execPath, [wrapProbe], installation, 30000)
    assert.match(output, /PASS installed renderer/u)
    assert.match(output, /PASS installed plugin panels and download deadline/u)
    console.log(output.trim())
  } finally { await rm(wrapProbe, { force: true }) }
  const selectionProbe = join(managedCli, 'verify-installed-panel-selection.mjs')
  await copyFile(new URL('./verify-panel-selection.mjs', import.meta.url), selectionProbe)
  try {
    const output = run(process.execPath, [selectionProbe, managedCli], installation, 30000)
    assert.match(output, /PASS panel selection/u)
    console.log(output.trim())
  } finally { await rm(selectionProbe, { force: true }) }
  const registrationProbe = join(managedCli, 'verify-installed-panel-registration.mjs')
  await copyFile(new URL('./verify-panel-registration.mjs', import.meta.url), registrationProbe)
  try {
    const output = run(process.execPath, [registrationProbe, managedCli], installation, 30000)
    assert.match(output, /PASS panel registration/u)
    console.log(output.trim())
  } finally { await rm(registrationProbe, { force: true }) }
  const reentrancyProbe = join(managedCli, 'verify-installed-panel-reentrancy.mjs')
  await copyFile(new URL('./verify-panel-reentrancy.mjs', import.meta.url), reentrancyProbe)
  try {
    const output = run(process.execPath, [reentrancyProbe, managedCli], installation, 30000)
    assert.match(output, /PASS panel reentrancy/u)
    console.log(output.trim())
  } finally { await rm(reentrancyProbe, { force: true }) }
  const hostEventsProbe = join(managedCli, 'verify-installed-host-panel-events.mjs')
  await copyFile(new URL('./verify-host-panel-events.mjs', import.meta.url), hostEventsProbe)
  try {
    const output = run(process.execPath, [hostEventsProbe, managedCli], installation, 30000)
    assert.match(output, /PASS host panel events/u)
    console.log(output.trim())
  } finally { await rm(hostEventsProbe, { force: true }) }
  const jobsDetachProbe = join(managedCli, 'verify-installed-jobs-detach-cleanup.mjs')
  await copyFile(new URL('./verify-jobs-detach-cleanup.mjs', import.meta.url), jobsDetachProbe)
  try {
    const output = run(process.execPath, [jobsDetachProbe, managedCli], installation, 30000)
    assert.match(output, /PASS jobs detach cleanup/u)
    console.log(output.trim())
  } finally { await rm(jobsDetachProbe, { force: true }) }
  const jobsCacheProbe = join(managedCli, 'verify-installed-jobs-cache-lifetime.mjs')
  await copyFile(new URL('./verify-jobs-cache-lifetime.mjs', import.meta.url), jobsCacheProbe)
  try {
    const output = run(process.execPath, [jobsCacheProbe, managedCli], installation, 30000)
    assert.match(output, /PASS jobs cache lifetime/u)
    console.log(output.trim())
  } finally { await rm(jobsCacheProbe, { force: true }) }
  const scienceRedactionProbe = join(managedCli, 'verify-installed-science-error-redaction.mjs')
  await copyFile(new URL('./verify-science-error-redaction.mjs', import.meta.url), scienceRedactionProbe)
  try {
    const output = run(process.execPath, [scienceRedactionProbe, managedCli], installation, 30000)
    assert.match(output, /PASS science error redaction/u)
    console.log(output.trim())
  } finally { await rm(scienceRedactionProbe, { force: true }) }
  const questionLifetimeProbe = join(managedCli, 'verify-installed-question-lifetime.mjs')
  await copyFile(new URL('./verify-question-lifetime.mjs', import.meta.url), questionLifetimeProbe)
  try {
    const output = run(process.execPath, [questionLifetimeProbe, managedCli], installation, 30000)
    assert.match(output, /PASS question lifetime/u)
    console.log(output.trim())
  } finally { await rm(questionLifetimeProbe, { force: true }) }
  const secretExportProbe = join(managedCli, 'verify-installed-secret-export.mjs')
  await copyFile(new URL('./verify-secret-export.mjs', import.meta.url), secretExportProbe)
  try {
    const output = run(process.execPath, [secretExportProbe, managedCli, join(runtime, 'runtime')], installation, 30000)
    assert.match(output, /PASS secret export/u)
    console.log(output.trim())
  } finally { await rm(secretExportProbe, { force: true }) }

  const routeProbe = join(managedCli, 'verify-quantum-route.mjs')
  await writeFile(routeProbe, 'import { recognizedQuantumCalculation } from "#flagqai/quantum-capability"; import { FLAGQUANTUM_MCP_ARGS, FLAGQUANTUM_MCP_PACKAGE, FLAGQUANTUM_MCP_PYTHON, FLAGQUANTUM_MCP_TORCH_ARGS } from "#flagqai/quantum-mcp-profile"; if (!recognizedQuantumCalculation("Solve a two-qubit VQE ground state") || !recognizedQuantumCalculation("算H2基态能量") || FLAGQUANTUM_MCP_ARGS[FLAGQUANTUM_MCP_ARGS.indexOf("--python") + 1] !== FLAGQUANTUM_MCP_PYTHON || FLAGQUANTUM_MCP_ARGS[FLAGQUANTUM_MCP_ARGS.indexOf("--from") + 1] !== FLAGQUANTUM_MCP_PACKAGE || JSON.stringify(FLAGQUANTUM_MCP_TORCH_ARGS) !== JSON.stringify(process.platform === "linux" ? ["--torch-backend", "cpu"] : [])) process.exit(1)\n')
  try { run(process.execPath, [routeProbe], installation) }
  finally { await rm(routeProbe, { force: true }) }
  const progressPolicyPath = join(runtime, 'dsh', 'profiles', 'flagqai', 'node_modules', '@flagqai', 'cli', 'lib', 'types', 'dsh-adapter', 'task-progress-policy.js')
  assert.match(await readFile(progressPolicyPath, 'utf8'), /Do not wait for the user to request a plan/u, 'managed profile must contain proactive Todo guidance')
  assert.match(await readFile(progressPolicyPath, 'utf8'), /For each new nontrivial user request/u, 'managed profile must guide subsequent tasks')
  await writeFile(progressPolicyPath, 'outdated same-version preview\n')
  const refreshed = run(process.execPath, [entry, 'setup', '--refresh'], installation)
  assert.match(refreshed, /FlagQAI runtime ready:/u)
  assert.match(await readFile(progressPolicyPath, 'utf8'), /Do not wait for the user to request a plan/u, 'same-version refresh must replace stale profile code')
  assert.match(await readFile(progressPolicyPath, 'utf8'), /For each new nontrivial user request/u, 'same-version refresh must restore subsequent-task guidance')
  const second = run(process.execPath, [entry, 'setup'], installation, 15000)
  assert.match(second, /FlagQAI runtime ready:/u)
  const doctor = run(process.execPath, [entry, 'doctor'], installation)
  assert.match(doctor, /FlagQAI managed runtime: ready/u)
  assert.ok(doctor.includes(`Harness: ${INSTALLED_RUNTIME.dsh} (expected ${INSTALLED_RUNTIME.dsh})`), 'doctor must report the pinned Harness version')
  assert.ok(doctor.includes(`FlagQuantum MCP: installed (${FLAGQUANTUM_MCP_PACKAGE})`), 'doctor must report the pinned FlagQuantum MCP')
  const managedProbe = join(installedRoot, 'verify-managed-mcp.mjs')
  await writeFile(managedProbe, `import { useInstalledRuntime } from './bin/installed-runtime.js'\nawait useInstalledRuntime(process.env)\nconsole.log(JSON.stringify({ command: process.env.FLAGQAI_MANAGED_MCP_EXECUTABLE, home: process.env.DSH_HOME }))\n`)
  try {
    const resolved = JSON.parse(run(process.execPath, [managedProbe], installation).trim())
    // setup may expand a Windows 8.3 TEMP path; assert filesystem identity.
    assert.equal(await realpath(resolved.command), await realpath(join(runtime, 'quantum-bin', process.platform === 'win32' ? 'flagquantum-mcp-server.exe' : 'flagquantum-mcp-server')))
    assert.equal(await realpath(resolved.home), await realpath(join(runtime, 'dsh')))
  } finally { await rm(managedProbe, { force: true }) }
  if (process.env.FLAGQAI_ACCEPTANCE_QUANTUM_PREFLIGHT === '1') {
    const preflight = run(process.execPath, [entry, 'quantum', '--check', 'Solve a VQE ground state'], installation)
    assert.ok(preflight.includes(`FlagQuantum ready: ${FLAGQUANTUM_MCP_PACKAGE},`), 'preflight must report the pinned FlagQuantum MCP')
    assert.match(preflight, /, \d+ tools; workspace writable/u)
  }
  if (process.env.FLAGQAI_ACCEPTANCE_QUANTUM_FIXTURE === '1') {
    const fixture = join(sandbox, 'quantum-preflight-fixture.mjs')
    const probe = join(installedRoot, 'quantum-write-probe.mjs')
    await copyFile(new URL('./quantum-preflight-fixture.mjs', import.meta.url), fixture)
    await writeFile(probe, `
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { preflightFlagQuantum } from '#flagqai/quantum-preflight'
const root = process.cwd()
const directories = [root, ...['cache', 'tools', 'python'].map(name => join(root, name))]
const env = { ...process.env, UV_CACHE_DIR: directories[1], UV_TOOL_DIR: directories[2], UV_PYTHON_INSTALL_DIR: directories[3] }
const result = await preflightFlagQuantum({
  cwd: root, env, task: 'Solve a two-qubit VQE ground state', command: 'uvx',
  spawnProcess: (_command, _args, options) => spawn(process.execPath, [process.argv[2]], options),
})
if (result.status !== 'ready' || result.runtimeChecks.join(',') !== 'simulate_circuit_tool,train_parameters_tool') process.exit(1)
for (const directory of directories) {
  if ((await readdir(directory)).some(name => name.startsWith('.flagqai-preflight-'))) process.exit(2)
}
console.log('PASS installed quantum directory write-and-sync probes')
`)
    try {
      assert.match(run(process.execPath, [probe, fixture], installation),
        /PASS installed quantum directory write-and-sync probes/u)
      console.log('PASS installed quantum directory write-and-sync probes')
    } finally {
      await rm(probe, { force: true })
    }
    if (process.platform !== 'win32') {
      // Keep the default quantum-enabled entry in the PTY test. Supply an
      // explicit scripted MCP, rather than disable preflight or use host uv.
      const bin = join(sandbox, 'fixture-bin')
      const quote = value => `'${value.replaceAll("'", "'\\''")}'`
      await mkdir(bin)
      await writeFile(join(bin, 'uvx'), `#!/bin/sh\nif [ "$1" = "--version" ]; then printf 'uvx scripted acceptance\\n'; exit 0; fi\nexec ${quote(process.execPath)} ${quote(fixture)}\n`, { mode: 0o700 })
      Object.assign(env, {
        DSH_HOME: join(runtime, 'dsh'),
        PATH: `${bin}${delimiter}${join(runtime, 'runtime', 'node_modules', '.bin')}${delimiter}${env.PATH ?? ''}`,
        UV_CACHE_DIR: join(sandbox, 'uv-cache'),
        UV_TOOL_DIR: join(sandbox, 'uv-tools'),
        UV_PYTHON_INSTALL_DIR: join(sandbox, 'uv-python'),
      })
      const launcherProbe = JSON.parse(run(process.execPath, [entry, 'quantum', '--check', '--json'], installation, 15000))
      assert.equal(launcherProbe.status, 'ready')
      assert.equal(launcherProbe.serverInfo.name, 'flagquantum-test', 'installed startup must select the explicit fixture, not a host MCP launcher')
      assert.deepEqual(launcherProbe.runtimeChecks, ['simulate_circuit_tool', 'train_parameters_tool'])
      console.log('PASS installed launcher: explicit MCP fixture, simulation and trainer preflight')
      console.log('Using an explicit scripted MCP for the default installed TUI entry')
    } else {
      // Windows cannot use the POSIX launcher fixture. Explicitly prepare the
      // real pinned MCP before the short PTY first-screen deadline starts.
      Object.assign(env, {
        UV_CACHE_DIR: join(sandbox, 'uv-cache'),
        UV_TOOL_DIR: join(sandbox, 'uv-tools'),
        UV_PYTHON_INSTALL_DIR: join(sandbox, 'uv-python'),
      })
      const launcherProbe = JSON.parse(run(process.execPath, [entry, 'quantum', '--check', '--json'], installation))
      assert.equal(launcherProbe.status, 'ready')
      assert.equal(launcherProbe.package, 'flagquantum-mcp-server==0.3.2')
      assert.deepEqual(launcherProbe.runtimeChecks, ['simulate_circuit_tool', 'train_parameters_tool'])
      console.log('PASS Windows installed MCP prewarm: real pinned simulation and trainer')
    }
  }
  if (process.env.FLAGQAI_ACCEPTANCE_SCIENCE_SDK === '1') {
    const pythonPath = run(process.execPath, [entry, 'science', '--pythonpath'], installation).trim()
    const expected = join(installation, 'node_modules', '@flagqai', 'cli', 'lib', 'flagqai-platform', 'scientific-core', 'python')
    assert.equal(await realpath(pythonPath), await realpath(expected), 'installed CLI must select its packaged Python helper')
    const testFile = join(sandbox, 'test_flagqai_science.py')
    await copyFile(new URL('../../../packages/scientific-core/python/test_flagqai_science.py', import.meta.url), testFile)
    const pythonEnv = { ...env, PYTHONPATH: pythonPath, PYTHONDONTWRITEBYTECODE: '1' }
    const pythonCandidates = process.platform === 'win32' ? [['python', []], ['py', ['-3']]] : [['python3', []], ['python', []]]
    const selected = pythonCandidates.find(([command, prefix]) => {
      const probe = spawnSync(command, [...prefix, '-c', 'import sys; raise SystemExit(sys.version_info < (3, 9))'], { env: pythonEnv, encoding: 'utf8', timeout: 5000 })
      return !probe.error && probe.status === 0
    })
    assert.ok(selected, 'installed scientific-run acceptance requires Python 3.9+')
    const [python, prefix] = selected
    const science = spawnSync(python, [...prefix, testFile], { cwd: installation, env: pythonEnv, encoding: 'utf8', timeout: 30000 })
    assert.equal(science.status, 0, `installed scientific-run regression failed: ${science.stderr ?? science.error}`)
    const testCount = science.stderr.match(/Ran (\d+) tests/u)
    assert.ok(testCount && Number(testCount[1]) >= 7, 'installed scientific-run regression did not run the expected tests')
    console.log(`PASS installed scientific-run helper: ${testCount[1]} tests`)
  }
  if (process.env.FLAGQAI_ACCEPTANCE_PERMISSION_EVIDENCE === '1') {
    const packagedTests = join(installation, 'node_modules', '@flagqai', 'cli', 'lib', 'flagqai-platform', 'scientific-core', 'session-telemetry-api.test.mjs')
    await copyFile(new URL('../../../packages/scientific-core/session-telemetry-api.test.mjs', import.meta.url), packagedTests)
    const output = run(process.execPath, ['--test', packagedTests], installation, 30000)
    assert.match(output, /accepted HTTP permission decisions remain redacted and durable after resume/u)
  }
  if (process.env.FLAGQAI_ACCEPTANCE_PTY_MODULE) {
    const { verifyInstalledTuiPty } = await import('./verify-installed-tui-pty.mjs')
    await verifyInstalledTuiPty({
      entry, cwd: installation, env, modulePath: process.env.FLAGQAI_ACCEPTANCE_PTY_MODULE,
      profilePatch: join(installedPaths(env).profile, 'cordis.patch.yml'),
      verifyProviderWizard: process.env.FLAGQAI_ACCEPTANCE_PROVIDER_WIZARD === '1',
      verifyAgentTurn: process.env.FLAGQAI_ACCEPTANCE_AGENT_TURN === '1',
    })
  }
  console.log(`PASS clean staged CLI first run: ${process.platform}/${process.arch} Node ${process.version}, setup and doctor ready without host credentials${process.env.FLAGQAI_ACCEPTANCE_AGENT_TURN === '1' ? ' using a local scripted model' : ' or a model request'}`)
  passed = true
} finally {
  if (passed || process.env.FLAGQAI_ACCEPTANCE_KEEP_SANDBOX !== '1') {
    removeAcceptanceSandbox(sandbox)
  } else {
    console.error(`First-run probe retained its isolated files at ${sandbox}`)
  }
}
