import { spawnSync } from 'node:child_process'

// Recursive removal can retry each locked Windows entry independently. Keep
// best-effort cleanup outside the verifier so it cannot consume the job budget.
export function removeAcceptanceSandbox(path, { timeout = 60000, run = spawnSync, log = console.log, warn = console.error } = {}) {
  const result = run(process.execPath, ['--input-type=module', '-e',
    "import { rm } from 'node:fs/promises'; await rm(process.argv[1], { recursive: true, force: true, maxRetries: 2, retryDelay: 100 })", path],
  { encoding: 'utf8', timeout, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 1024 * 1024 })
  if (result.error || result.status !== 0) {
    warn(`Could not remove the probe sandbox (${path}): ${result.error?.code ?? result.stderr?.trim() ?? result.status}; leaving it for runner cleanup`)
    return false
  }
  log('First-run sandbox cleanup complete')
  return true
}
