import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Run server commands through the repository-managed Harness profile when the
 * CLI entry point is executed directly from a FlagQAI source checkout.
 * Published packages do not contain the repository runtime helper and fall
 * through to the regular launcher.
 */
export async function runSourceServer({ env = process.env, root = packageDir } = {}) {
  const projectRoot = resolve(root, '..', '..')
  const runtimeModule = join(projectRoot, 'scripts', 'lib', 'flagqai-cli-runtime.mjs')
  if (!existsSync(runtimeModule)) return false

  const { inspectFlagqaiCli, launchFlagqaiCli } = await import(pathToFileURL(runtimeModule).href)
  const status = await inspectFlagqaiCli(projectRoot, env)
  if (!status.ready) {
    throw new Error('FlagQAI source runtime is not ready. Run `npm run cli:setup` once, then retry this command.')
  }
  await launchFlagqaiCli(projectRoot, [], undefined, undefined, { env })
  return true
}
