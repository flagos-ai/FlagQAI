import { AsyncLocalStorage } from 'node:async_hooks'
import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, sep } from 'node:path'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'

// Native tools can hold different scoped handles to the same provider.
// Mark the underlying service once and carry the policy per async call.
const searchRoot = new AsyncLocalStorage<string>()
const wrapped = Symbol('macOS search isolation')
type SearchProvider = SubprocessRuntime & { [wrapped]?: true }

function inside(root: string, path: string): boolean {
  const remainder = relative(root, path)
  return remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder)
}

export function withMacOSSearchIsolation<T>(
  provider: SearchProvider,
  workspace: string,
  run: () => Promise<T>,
): Promise<T> {
  if (process.platform !== 'darwin') throw new Error('Search isolation requires macOS Seatbelt.')
  const workspaceRoot = realpathSync(workspace)
  if (workspaceRoot === '/') throw new Error('Search isolation requires a dedicated workspace.')
  if (!provider[wrapped]) {
    const spawn = provider.spawn.bind(provider)
    provider.spawn = spec => {
      const root = searchRoot.getStore()
      if (!root) return spawn(spec)
      const [binary, marker, ...args] = spec.argv
      if (!binary || !isAbsolute(binary) || marker !== '--no-config' || basename(binary) !== 'rg') {
        throw new Error('Unexpected native search executable.')
      }
      const executable = realpathSync(binary)
      const cwd = realpathSync(spec.cwd ?? process.cwd())
      if (!inside(root, cwd)) throw new Error('Search working directory is outside the session workspace.')
      const metadata = new Set<string>()
      for (const path of [root, executable]) {
        for (let parent = dirname(path); ; parent = dirname(parent)) {
          metadata.add(parent)
          if (parent === '/') break
        }
      }
      const profile = [
        '(version 1)(deny default)(import "system.sb")(deny network*)',
        '(allow process-exec sysctl-read)',
        `(allow file-read* (subpath ${JSON.stringify(root)}) (literal ${JSON.stringify(executable)}))`,
        `(allow file-read-metadata ${[...metadata].map(path => `(literal ${JSON.stringify(path)})`).join(' ')})`,
      ].join('')
      return spawn({
        ...spec,
        argv: ['/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', `HOME=${root}`, `TMPDIR=${root}`,
          '/usr/bin/sandbox-exec', '-p', profile, '--', executable, marker, ...args],
        cwd,
      })
    }
    provider[wrapped] = true
  }
  return searchRoot.run(workspaceRoot, run)
}
