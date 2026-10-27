import { createWebControls } from './web-controls.js'
import type { Context } from '@deepseek-ai/cordis'
import { readModelPref } from '../modelPrefs.js'
import { resolveModelRoute, type ModelRoute } from '../modelRoute.js'
import { createDshBackend } from './backend/backend.js'
import { createDshSessionCatalog } from './backend/catalog.js'
import { createDshSession } from './backend/session.js'
import type { HeadlessSessionInteractions } from './headless-interactions.js'
import { resolveAgent } from './resolve-agent.js'

type ResolvedAgent = Awaited<ReturnType<typeof resolveAgent>>

/** One Harness session factory for terminal and HTTP transports. */
export function createSessionBackend(ctx: Context, options: {
  configuredRoute: { provider?: string; model?: string }
  startupRoute: ModelRoute
  cwd: string
  preset?: string
  webControls?: boolean
  onResolved?(resolved: ResolvedAgent): void
  interactions?(resolved: ResolvedAgent): HeadlessSessionInteractions
}) {
  return createDshBackend(async target => {
    const resolved = await resolveAgent(
      ctx,
      target.kind === 'resume' ? target.sessionId : undefined,
      options.configuredRoute,
      resolveModelRoute(options.configuredRoute, readModelPref(), options.startupRoute),
      { cwd: target.kind === 'create' ? target.cwd : options.cwd },
      options.preset,
    )
    options.onResolved?.(resolved)
    return createDshSession(ctx, { agent: resolved.agent, handle: resolved.handle }, {
      interactions: options.interactions?.(resolved),
      route: resolved.route,
      controls: options.webControls && resolved.route ? await createWebControls(ctx, resolved.agent, resolved.route) : undefined,
    })
  }, createDshSessionCatalog(ctx))
}
