/** Headless FlagQAI API host mounted inside the real Harness composition. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { join } from 'node:path'
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
import { withTaskProgressPolicy } from './task-progress-policy.js'

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
  // The headless host resolves the same Harness Agent as the terminal client.
  // Keep model-facing Todo guidance on both transports; the policy helper
  // reconciles duplicates and removes guidance when a preset hides todo_write.
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) =>
    withTaskProgressPolicy(await next()))
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
