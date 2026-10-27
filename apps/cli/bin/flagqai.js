#!/usr/bin/env node

// Primary FlagQAI entry point. Server and remote-client commands stay outside
// the local TUI bootstrap; all other arguments retain the mature launcher.
import { automaticQuantumTask, defaultQuantumSession } from './quantum-route.js'

const explicitQuantum = process.argv[2] === 'quantum'
const autoQuantumTask = explicitQuantum ? null : automaticQuantumTask(process.argv.slice(2))
const defaultQuantum = !explicitQuantum && defaultQuantumSession(process.argv.slice(2))
if (process.argv[2] === 'science') {
  if (process.argv[3] === '--help' || process.argv[3] === '-h') {
    console.log('Usage: flagqai science --pythonpath\nPrint the bundled local scientific-run helper directory for PYTHONPATH. Python 3.9+ is required for this optional helper.')
    process.exit(0)
  }
  if (process.argv.length !== 4 || process.argv[3] !== '--pythonpath') {
    console.error('Usage: flagqai science --pythonpath')
    process.exit(2)
  }
  const { existsSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const source = new URL('../../../packages/scientific-core/python/flagqai_science.py', import.meta.url)
  const installed = new URL('../lib/flagqai-platform/scientific-core/python/flagqai_science.py', import.meta.url)
  const module = existsSync(source) ? source : installed
  if (!existsSync(module)) {
    console.error('FlagQAI scientific-run helper is missing; reinstall the CLI package.')
    process.exit(1)
  }
  console.log(dirname(fileURLToPath(module)))
  process.exit(0)
}
if (explicitQuantum || defaultQuantum || autoQuantumTask) {
  if (explicitQuantum && ['--help', '-h'].includes(process.argv[3])) {
    console.log('Usage: flagqai quantum [task]\n       flagqai quantum --check [task]\n       flagqai quantum --check --json [task]\nVerify the pinned FlagQuantum MCP and writable workspace and uv cache before starting a native Harness session. With no task, check both circuit simulation and VQE training for the interactive session. Tool use still requires runtime evidence and independent scientific validation.')
    process.exit(0)
  }
  const checkOnly = explicitQuantum && process.argv[3] === '--check'
  const jsonCheck = checkOnly && process.argv[4] === '--json'
  try {
    const { existsSync } = await import('node:fs')
    const sourceCheckout = existsSync(new URL('../../../scripts/lib/flagqai-cli-runtime.mjs', import.meta.url))
    if (!sourceCheckout) await (await import('./installed-runtime.js')).useInstalledRuntime()
    const { preflightFlagQuantum } = await import('./quantum-preflight.js')
    if (!jsonCheck) console.error('Checking the pinned FlagQuantum tools and workspace before starting the task...')
    const task = autoQuantumTask ?? (explicitQuantum ? process.argv.slice(jsonCheck ? 5 : checkOnly ? 4 : 3).join(' ') : '')
    let stage = 'environment'
    const startedAt = Date.now()
    const progress = jsonCheck ? undefined : setInterval(() => {
      if (stage === 'environment') return
      const detail = stage === 'mcp-starting' ? 'waiting for the pinned MCP to initialize'
        : stage === 'mcp-initialized' ? 'discovering MCP tools'
          : 'running bounded capability checks'
      console.error(`FlagQuantum preflight: ${detail} (${Math.floor((Date.now() - startedAt) / 1000)}s). Press Ctrl-C to cancel.`)
    }, 30000)
    progress?.unref()
    let result
    try {
      result = await preflightFlagQuantum({ task, onProgress: next => {
        stage = next
        if (!jsonCheck && next === 'mcp-starting') {
          console.error(process.env.FLAGQAI_MANAGED_MCP_EXECUTABLE
            ? 'Starting the installed FlagQuantum MCP (10-minute limit).'
            : 'Starting the pinned FlagQuantum MCP; a cold dependency install may take several minutes (10-minute limit).')
        }
      } })
    } finally { if (progress) clearInterval(progress) }
    if (checkOnly) {
      if (jsonCheck) console.log(JSON.stringify(result))
      else console.log(`FlagQuantum ready: ${result.package}, ${result.toolCount} tools; workspace writable${result.uvCache.status === 'writable' ? ' and uv cache writable' : ''}. Verified route: ${result.capability.id} (bounded probe only; task result not validated).`)
      process.exit(0)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (jsonCheck) console.log(JSON.stringify({ schemaVersion: 1, status: 'failed', error: { code: error?.code ?? 'preflight_failed', message } }))
    else console.error(message)
    process.exit(1)
  }
  process.env.FLAGQAI_PRESET = 'flagquantum'
  process.env.FLAGQAI_ENABLE_FLAGQUANTUM_MCP = '1'
  if (explicitQuantum) process.argv.splice(2, 1)
}
if (process.argv[2] === 'desktop' || process.argv[2] === 'web') {
  console.error(`FlagQAI ${process.argv[2]} is not included in the CLI-first edition.`)
  process.exitCode = 1
} else if (process.argv[2] === 'setup') {
  try {
    const option = process.argv[3]
    if (process.argv.length > 4 || (option !== undefined && !['--refresh', '--help', '-h'].includes(option))) {
      throw new Error('Usage: flagqai setup [--refresh]')
    }
    if (option === '--help' || option === '-h') {
      console.log('Usage: flagqai setup [--refresh]\nInstall the pinned local Harness, FlagQuantum MCP, and native profile from the installed CLI package. --refresh reinstalls the profile after replacing a preview package with the same version. No API key is requested here.')
      process.exit(0)
    }
    const { setupInstalledRuntime } = await import('./installed-runtime.js')
    const status = await setupInstalledRuntime({ refresh: option === '--refresh' })
    console.log(`FlagQAI runtime ready: Harness ${status.dshVersion}, CLI ${status.cliVersion}, FlagQuantum MCP ${status.quantumReady ? 'installed' : 'missing'}`)
    console.log('Run flagqai to configure an official provider or an API gateway with /setup.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
} else if (process.argv[2] === 'doctor' && process.env.DSH_HOME === undefined) {
  try { process.exitCode = await (await import('./installed-runtime.js')).installedDoctor() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
} else if (process.argv[2] === 'attach') {
  const { runAttachCli } = await import('./attach.js')
  process.exitCode = await runAttachCli(process.argv.slice(3))
} else {
  let serverCommand = false
  if (process.argv[2] === 'serve') {
    serverCommand = true
    try {
      const { parseServeArgs } = await import('./serve-args.js')
      const { host, port } = parseServeArgs(process.argv.slice(3))
      process.env.FLAGQAI_SERVER_MODE = '1'
      process.env.FLAGQAI_SERVER_HOST = host
      process.env.FLAGQAI_SERVER_PORT = String(port)
      process.argv.splice(2)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 2
      process.exit()
    }
  }
  try {
    const sourceRuntimeStarted = serverCommand
      ? await (await import('./source-runtime.js')).runSourceServer()
      : false
    if (!sourceRuntimeStarted) {
      const { existsSync } = await import('node:fs')
      const sourceCheckout = existsSync(new URL('../../../scripts/lib/flagqai-cli-runtime.mjs', import.meta.url))
      const infoOnly = ['--help', '-h', 'help', '--version', '-v', 'version'].includes(process.argv[2])
      if (!infoOnly && !sourceCheckout) await (await import('./installed-runtime.js')).useInstalledRuntime()
      if (!sourceCheckout && process.env.DSH_HOME === undefined && ['--version', '-v', 'version'].includes(process.argv[2])) {
        // Version stays read-only, but must inspect the same managed profile as setup and doctor.
        process.env.DSH_HOME = (await import('./installed-runtime.js')).installedPaths().dshHome
      }
      await import('./native-launcher.js')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
