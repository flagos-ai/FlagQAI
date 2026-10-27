/** Non-DSH backend loading, detection and startup session ownership. */
import type { Context } from '@deepseek-ai/cordis'
import type { AgentBackend, BackendHost, KernelStatus, OpenTarget } from '../agent/backend.js'
import type { AgentEvent } from '../agent/events.js'
import type { AgentSession } from '../agent/session.js'
import { createAgentBackendRegistry, type AgentBackendRegistry } from '../agent/registry.js'
import { formatSessionRef } from '../agent/refs.js'
import { reserveMount, reserveNewSession } from '../sessionMounts.js'
import { resumeTargetFromArgv } from '../sessionHistory.js'
import { mountFailureText } from '../sessions/resumeFailure.js'
import { logForDebugging } from '../utils/debug.js'
// Static on purpose: the install module imports no vendor package (node
// built-ins + update.ts, which this adapter loads anyway), so a DSH-only
// boot pays nothing for having the wizard's surface at hand.
import { fileChannelTokens } from '../backends/shared/channel-tokens.js'

/** Close an already-loaded backend's pooled processes without loading it on DSH. */
export async function closeBackendResources(): Promise<void> {
  // The first-release runtime has no pooled optional backend process.
}

/** One registry owns every backend visible to this process, including DSH. */
export function createRuntimeBackendRegistry(dsh: AgentBackend): AgentBackendRegistry {
  return createAgentBackendRegistry([{ id: 'dsh', load: async () => dsh }])
}

/** Harness owns provider credentials for the first-release DSH backend. */
export async function createBackendHost(ctx: Context, cwd: string, stderr: (line: string) => void): Promise<BackendHost> {
  return {
    cwd,
    debug: message => logForDebugging(message),
    warn: message => ctx.logger.warn(message),
    stderr,
    tokenStore: fileChannelTokens(undefined, message => logForDebugging(message)),
  }
}

/** Resume failures abort boot; history is read before the channel's first paint. */
export async function openBackendStartup(ctx: Context, backend: AgentBackend, input: {
  readonly cwd: string
  readonly stderr: (line: string) => void
  readonly configuredSessionId?: string
  readonly argv: readonly string[]
}) {
  const launch = backend.launch
  if (launch === undefined) throw new Error(`flagqai: backend "${backend.id}" does not support startup`)
  const host = await createBackendHost(ctx, input.cwd, input.stderr)
  const prefs = launch.sessionPrefs(host.debug)
  const requested = (input.configuredSessionId ?? resumeTargetFromArgv(input.argv, () => prefs.lastSession()))?.trim()
  const resumeId = requested === undefined || requested === ''
    ? undefined
    : requested.startsWith(`${backend.id}:`) ? requested.slice(backend.id.length + 1) : requested
  let session: AgentSession
  let initialHistory: readonly AgentEvent[] = []
  if (resumeId !== undefined) {
    const key = formatSessionRef({ backendId: backend.id, sessionId: resumeId })
    const reserved = await reserveMount(key)
    if (!reserved.ok) {
      throw new Error(`flagqai: cannot resume ${backend.descriptor.label} session "${resumeId}": ${mountFailureText(reserved)} — ` +
        'two processes driving one session would interleave its transcript. Close that terminal, or drop --resume to start a fresh session.')
    }
    try {
      session = await backend.open({ kind: 'resume', sessionId: resumeId }, host)
      try {
        initialHistory = await session.history()
      } catch (error) {
        await session.dispose().catch(() => undefined)
        throw error
      }
    } catch (error) {
      reserved.reservation.abandon()
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`flagqai: cannot resume ${backend.descriptor.label} session "${resumeId}": ${reason} — no fresh session was started instead. ` +
        'Drop --resume to start a fresh session.', { cause: error })
    }
    reserved.reservation.settle()
    prefs.setLastSession(resumeId)
    prefs.touch(resumeId)
  } else {
    session = await backend.open({ kind: 'create', cwd: input.cwd }, host)
    const { reservation } = await reserveNewSession(formatSessionRef(session.ref))
    reservation.settle()
  }
  return {
    session,
    label: backend.descriptor.label,
    backendId: backend.id,
    initialHistory,
    catalog: backend.catalog,
    sessionPrefs: prefs,
    // A submitted user row means the backend has persisted a resumable transcript.
    persisted: (_sessionId: string, rows: readonly { readonly kind: string }[]) => rows.some(row => row.kind === 'user'),
    resumeCommand: (sessionId: string) => launch.resumeCommand(sessionId),
    open: (target: Extract<OpenTarget, { readonly kind: 'create' | 'resume' }>) =>
      backend.open(target, target.kind === 'create' ? { ...host, cwd: target.cwd } : host),
  }
}

/** Probe optional backends lazily; failed loading leaves their row unavailable. */
export async function probeKernels(ctx: Context, cwd: string): Promise<Record<string, KernelStatus>> {
  return {}
}
