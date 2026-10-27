import { existsSync, realpathSync } from 'node:fs'
import { posix, win32 } from 'node:path'

/** Resolve npm's JS entry so Windows setup does not rely on cmd.exe shims. */
export function resolveNpmCli({
  platform = process.platform,
  nodePath = process.execPath,
  environment = process.env,
  exists = existsSync,
  realpath = realpathSync,
} = {}) {
  const paths = platform === 'win32' ? win32 : posix
  const bin = paths.dirname(nodePath)
  const candidates = [
    paths.join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    paths.join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]
  for (const candidate of candidates) if (exists(candidate)) return candidate
  if (platform !== 'win32') {
    const link = paths.join(bin, 'npm')
    if (exists(link)) {
      const target = realpath(link)
      if (paths.basename(target) === 'npm-cli.js' && exists(target)) return target
    }
  }
  const invoked = environment.npm_execpath
  if (invoked && paths.basename(invoked) === 'npm-cli.js' && exists(invoked)) return invoked
  throw new Error('Cannot locate npm CLI beside Node.js. Install Node.js with npm, then retry.')
}
