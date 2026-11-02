import { existsSync } from 'node:fs'
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))

export function sourceServerOverlay(root, env) {
  return [
    { id: 'flagqai-server-host', disabled: true },
    { insert: [{ id: 'flagqai-source-server-host',
      name: pathToFileURL(join(root, 'lib/types/dsh-adapter/server-host.js')).href,
      inject: ['agents'], config: { host: env.FLAGQAI_SERVER_HOST || '127.0.0.1',
        port: Number(env.FLAGQAI_SERVER_PORT || '4096'),
        ...(env.FLAGQAI_PROVIDER ? { provider: env.FLAGQAI_PROVIDER } : {}),
        ...(env.FLAGQAI_MODEL ? { model: env.FLAGQAI_MODEL } : {}),
        ...(env.FLAGQAI_PRESET ? { preset: env.FLAGQAI_PRESET } : {}),
      } }] },
  ]
}

/** Reuse the managed Harness/configuration, but load this checkout's server. */
async function launchCheckoutServer(root, projectRoot, env) {
  const entry = join(root, 'lib/types/dsh-adapter/server-host.js')
  if (!existsSync(entry)) throw new Error('Build the source CLI before starting its Web service: pnpm cli:build')
  const { installedPaths, INSTALLED_RUNTIME } = await import('./installed-runtime.js')
  const paths = installedPaths(env)
  const manifestPath = join(paths.runtime, 'node_modules/@deepseek-ai/dsh/package.json')
  if (!existsSync(manifestPath)) throw new Error('Set up the managed FlagQAI runtime before starting the source service.')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.version !== INSTALLED_RUNTIME.dsh) throw new Error('The managed Harness version does not match this source checkout.')
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.dsh
  if (!bin) throw new Error('The managed Harness executable is missing.')
  const parent = join(projectRoot, '.flagqai')
  await mkdir(parent, { recursive: true })
  const temporary = await mkdtemp(join(parent, 'source-server-'))
  const overlay = join(temporary, 'overlay.yml')
  let child
  const interrupt = signal => child?.kill(signal)
  const onInt = () => interrupt('SIGINT')
  const onTerm = () => interrupt('SIGTERM')
  try {
    await writeFile(overlay, JSON.stringify(sourceServerOverlay(root, env)))
    child = spawn(process.execPath, [join(dirname(manifestPath), bin), '--profile', 'flagqai', '--patch', overlay], {
      cwd: projectRoot, env: { ...env, DSH_HOME: paths.dshHome }, stdio: 'inherit',
    })
    process.on('SIGINT', onInt)
    process.on('SIGTERM', onTerm)
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : code ?? 1))
    })
    if (code !== 0) throw new Error(`Source Agent service exited with code ${code}.`)
  } finally {
    process.off('SIGINT', onInt)
    process.off('SIGTERM', onTerm)
    await rm(temporary, { recursive: true, force: true })
  }
}

/**
 * Run server commands through the repository-managed Harness profile when the
 * CLI entry point is executed directly from a FlagQAI source checkout.
 * Published packages do not contain the repository runtime helper and fall
 * through to the regular launcher.
 */
export async function runSourceServer({ env = process.env, root = packageDir } = {}) {
  const projectRoot = resolve(root, '..', '..')
  const runtimeModule = join(projectRoot, 'scripts', 'lib', 'flagqai-cli-runtime.mjs')
  if (!existsSync(runtimeModule)) {
    if (!existsSync(join(root, 'src/dsh-adapter/server-host.ts')) || !existsSync(join(projectRoot, 'packages/server/index.mjs'))) return false
    await launchCheckoutServer(root, projectRoot, env)
    return true
  }

  const { inspectFlagqaiCli, launchFlagqaiCli } = await import(pathToFileURL(runtimeModule).href)
  const status = await inspectFlagqaiCli(projectRoot, env)
  if (!status.ready) {
    throw new Error('FlagQAI source runtime is not ready. Run `npm run cli:setup` once, then retry this command.')
  }
  await launchFlagqaiCli(projectRoot, [], undefined, undefined, { env })
  return true
}
