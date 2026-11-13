/** Headless FlagQAI API host mounted inside the real Harness composition. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import Schema from '@deepseek-ai/schemastery'
import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DATA_DIR } from '../utils/paths.js'
import { createSessionBackend } from './session-backend.js'
import { closeBackendResources, createBackendHost, createRuntimeBackendRegistry } from './backends.js'
import { initializeSessionPresets } from './session-bootstrap.js'
import { createWebSessionView } from './web-session-view.js'
import { startSessionMountHeartbeat } from './session-mount-heartbeat.js'
import { formatSessionRef } from '../agent/refs.js'
import { occupancyOf, readSessionOwners, releaseMount, reserveMount } from '../sessionMounts.js'
import { readModelPref, writeModelPref } from '../modelPrefs.js'
import { resolveModelRoute } from '../modelRoute.js'
import { createHeadlessInteractionRouter } from './headless-interactions.js'
import { createSettingsHosts } from './channel/settings-host.js'
import { createWebModelManager } from './web-model-manager.js'
import { createWebContextManager } from './web-context-manager.js'
import { createProviderManager } from './provider-manager.js'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { withMacOSReadIsolation } from './macos-read-isolation.js'
import { withMacOSSearchIsolation } from './macos-search-isolation.js'
import { withTaskProgressPolicy } from './task-progress-policy.js'
import { deepSeekReplayStream } from './compat/deepseekStream.js'

export const name = 'flagqai-server-host'
export const inject = ['agents', 'agentPresets', 'llm', 'settings', 'credentials']

export interface Config {
  host?: string
  port?: number
  provider?: string
  model?: string
  preset?: string
}

export const Config = Schema.object({
  host: Schema.string().default('127.0.0.1'),
  port: Schema.number().min(0).max(65535).step(1).default(4096),
  provider: Schema.string(),
  model: Schema.string(),
  preset: Schema.string(),
})

type ServerModule = {
  createFlagQaiServer(options: Record<string, unknown>): {
    listen(): Promise<{ port: number } | string | null>
    close(): Promise<void>
  }
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  ctx.on('llm/stream', (options, next) => deepSeekReplayStream(
    options, createSettingsHosts(ctx).providerSetup()?.listConfiguredProviders({ effective: true }),
    request => ctx.llm.stream(request), next,
  ))
  // The headless host resolves the same Harness Agent as the terminal client.
  // Keep model-facing Todo guidance on both transports; the policy helper
  // reconciles duplicates and removes guidance when a preset hides todo_write.
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) =>
    withTaskProgressPolicy(await next()))
  if (process.env.FLAGQAI_MACOS_SHELL_ISOLATION === '1') {
    ctx.on('tools/execute', async (exec, next) => {
      if (exec.name === 'read' || exec.name === 'read_image') {
        const workspace = exec.agent?.session.header.cwd
        const fs = exec.agent?.ctx.get('fs') as Context['fs'] | undefined
        if (!workspace || !fs) throw new Error('File read isolation requires a local session workspace and filesystem provider.')
        return withMacOSReadIsolation(fs, workspace, next)
      }
      if (exec.name !== 'grep' && exec.name !== 'glob') return next()
      const workspace = exec.agent?.session.header.cwd
      const provider = exec.agent?.ctx.get('subprocess') as SubprocessRuntime | undefined
      if (!workspace || !provider) throw new Error('Search isolation requires a local session workspace and subprocess provider.')
      return withMacOSSearchIsolation(provider, workspace, next)
    })
    ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name !== 'bash') return next()
      const policy = exec.agent?.ctx.get('sandboxPolicy') as {
        resolve(input: { session: NonNullable<typeof exec.agent>['session'] }): { mode: string }
      } | undefined
      const requested = (exec.arguments as { sandbox_permissions?: unknown } | null)?.sandbox_permissions
      if (!exec.agent || !policy || policy.resolve({ session: exec.agent.session }).mode !== 'workspace-write'
        || (requested !== undefined && requested !== 'workspace-write')) {
        return { kind: 'deny', reason: 'macOS shell isolation requires workspace-write mode without escalation.' }
      }
      return next()
    })
  }
  if (process.env.FLAGQAI_WORKSPACE_READ_GUARD === '1') {
    ctx.on('tools/pre-execute', async (exec, next) => {
      const search = exec.name === 'grep' || exec.name === 'glob'
      if (!search && exec.name !== 'read' && exec.name !== 'read_image') return next()
      const args = exec.arguments as { file_path?: unknown; path?: unknown } | null
      const input = search ? args?.path ?? '.' : args?.file_path
      if (typeof input !== 'string' || !input.trim()) return next()
      const root = exec.agent?.session.header.cwd
      const deny = { kind: 'deny' as const, reason: 'Workspace read guard denied this file. Use a file inside the session workspace.' }
      if (!root || !exec.agent) return deny
      try {
        const workingDirectory = exec.agent.ctx.get('workingDirectory') as {
          ensure(agent: NonNullable<typeof exec.agent>, signal: AbortSignal): Promise<string | undefined>
        } | undefined
        const fs = exec.agent.ctx.get('fs') as Context['fs'] | undefined
        if (!workingDirectory || !fs) return deny
        const cwd = await workingDirectory.ensure(exec.agent, exec.signal)
        // ripgrep passes its path straight to the OS. Preserve dot segments
        // until realpath, so a symlink followed by '..' resolves as it does
        // in the subprocess.
        const requestedPath = search
          ? (isAbsolute(input) ? input : `${cwd ?? process.cwd()}${sep}${input}`)
          : fs.processPath(await fs.resolve(input, { cwd, signal: exec.signal }))
        const path = await realpath(requestedPath)
        const inside = relative(await realpath(resolve(root)), path)
        if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return deny
      } catch {
        return exec.signal.aborted ? { kind: 'cancel' as const } : deny
      }
      return next()
    })
  }
  const cwd = process.cwd()
  const configuredRoute = { provider: config.provider, model: config.model }
  const bindings = {
    cwd,
    initializePresets: () => initializeSessionPresets(ctx),
    currentModelSelection: () => (ctx.get('agentDefaultModel') as {
      currentSelection?(): { provider?: unknown; model?: unknown }
    } | undefined)?.currentSelection?.(),
    resolveStartupRoute: (route: typeof configuredRoute, defaults?: { provider: string; model: string }) =>
      resolveModelRoute(route, readModelPref(), defaults),
    createInteractions: () => createHeadlessInteractionRouter(ctx),
    createSessionBackend: (options: Parameters<typeof createSessionBackend>[1]) => createSessionBackend(ctx, options),
    createRegistry: createRuntimeBackendRegistry,
    createBackendHost: () => createBackendHost(ctx, cwd, line => ctx.logger.warn(`[backend] ${line}`)),
    createSessionView: createWebSessionView,
    createModelManager: (bind: Parameters<typeof createWebModelManager>[1]) => createWebModelManager(ctx, bind),
    createContextManager: () => createWebContextManager(ctx),
    async providerOptions() {
      const providerSetup = createSettingsHosts(ctx).providerSetup()
      return providerSetup === undefined ? {} : { providerManager: await createProviderManager(providerSetup, writeModelPref) }
    },
    createSessionGuard: () => ({
      occupancy(backendId: string, sessionId: string) {
        const result = occupancyOf(formatSessionRef({ backendId, sessionId }), readSessionOwners())
        return result.kind === 'free'
          ? { kind: 'free' }
          : result.kind === 'mine'
            ? { kind: 'active' }
            : { kind: 'occupied', pid: result.pid }
      },
      async reserve(backendId: string, sessionId: string) {
        const key = formatSessionRef({ backendId, sessionId })
        const current = occupancyOf(key, readSessionOwners())
        if (current.kind !== 'free') {
          return current.kind === 'occupied'
            ? { ok: false as const, pid: current.pid }
            : { ok: false as const }
        }
        const reserved = await reserveMount(key)
        if (!reserved.ok) {
          return reserved.reason === 'occupied'
            ? { ok: false as const, pid: reserved.holders[0] }
            : { ok: false as const }
        }
        return {
          ok: true as const,
          settle: reserved.reservation.settle,
          abandon: reserved.reservation.abandon,
          release: () => { releaseMount(key) },
        }
      },
    }),
    closeBackendResources,
    onError: (error: unknown) => ctx.logger.error(error),
  }
  type Composition = { options: Record<string, unknown>; dispose(): Promise<void> }
  type AdapterModule = {
    createHarnessComposition(config: Config, ports: typeof bindings): Promise<Composition>
    startHarnessHost(input: {
      compose(): Promise<Composition>
      createServer: ServerModule['createFlagQaiServer']
      serverOptions: Record<string, unknown>
      startHeartbeat(): () => void
      onError(error: unknown): void
    }): Promise<{ address: { port: number } | string | null; close(): Promise<void> }>
  }
  const adapterPath = '../../flagqai-platform/harness-adapter/index.mjs'
  const { createHarnessComposition, startHarnessHost } = await import(adapterPath) as AdapterModule
  const modulePath = '../../flagqai-platform/server/index.mjs'
  const { createFlagQaiServer } = await import(modulePath) as ServerModule
  const evidencePath = '../../flagqai-platform/scientific-core/permission-decisions.mjs'
  const { createPermissionDecisionStore } = await import(evidencePath) as {
    createPermissionDecisionStore(options: { directory: string }): unknown
  }
  const host = await startHarnessHost({
    compose: () => createHarnessComposition(config, bindings),
    createServer: createFlagQaiServer,
    serverOptions: {
      hostname: config.host ?? '127.0.0.1',
      port: config.port ?? 4096,
      onError: bindings.onError,
      messageDeliveryDirectory: join(DATA_DIR, 'message-delivery'),
      permissionDecisionStore: createPermissionDecisionStore({ directory: join(DATA_DIR, 'permission-evidence') }),
    },
    startHeartbeat: () => startSessionMountHeartbeat(ctx),
    onError: bindings.onError,
  })
  const { address } = host

  // Cordis owns disposal; the adapter owns the acquired resources.
  ctx.effect(() => () => { void host.close().catch(bindings.onError) })
  ctx.logger.info(`FlagQAI local service listening on ${JSON.stringify(address)}`)
}
