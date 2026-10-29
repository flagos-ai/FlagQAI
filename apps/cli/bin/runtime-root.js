import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/** Keep Windows short names and junctions out of the Harness module graph. */
export function resolveRuntimeRoot(path, platform = process.platform, realpath = realpathSync.native) {
  const absolute = resolve(path)
  if (platform !== 'win32') return absolute
  const missing = []
  let ancestor = absolute
  for (;;) {
    try { return join(realpath(ancestor), ...missing) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = dirname(ancestor)
      if (parent === ancestor) throw error
      missing.unshift(basename(ancestor))
      ancestor = parent
    }
  }
}
