/** Native root resolution, decoder loading and event-catalog registration. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { homeDir } from '../../utils/paths.js'
import { createSessionLogAccess } from '#flagqai/harness-adapter/session-log-access'
export type SessionLogRead = import('#flagqai/harness-adapter/session-log-access').SessionLogRead<SessionEvent>
type StorageDecoder = (value: unknown) => SessionEvent[]

/**
 * Legacy third-party session-event types the TUI vouches for as ephemeral
 * UI frames — safe for the strict read path to accept and skip. Exported
 * for the regression verifier; grow it only with proof the type was always
 * inert (never load-bearing for session reconstruction).
 *
 * 0.1.5 note: the vouch is not only for OLD logs. `session/color` is written
 * by the TUI itself on every host generation (session-metadata.ts), and
 * 0.1.5's `validateStoredEvents` refuses unknown non-ignorable types at load
 * — without this registration a single color pick makes that session
 * permanently unresumable (probed: SessionFormatUnsupportedError without the
 * vouch, clean load with it). The type stays inert for reconstruction either
 * way: it only re-tints the row.
 */
export const LEGACY_SESSION_EVENT_TYPES: readonly string[] = ['activity/status', 'session/color']

/**
 * Session-log storage roots, in priority order, mirroring the persistence
 * backend's `root` resolution: cordis.patch.yml sets `FLAGQAI_SESSION_ROOT ?? dshHomePath(
 * 'sessions')` where dshHomePath is `$DSH_HOME ?? ~/.dsh`; the unpatched
 * cordis.yml base falls back to ~/.flagqai/sessions, kept here as the legacy
 * last resort. Every candidate is scanned — the first hit wins, so an
 * explicit FLAGQAI_SESSION_ROOT always outranks the defaults.
 */
export function sessionsRoots(): string[] {
  const home = homeDir()
  const roots: string[] = []
  const override = process.env.FLAGQAI_SESSION_ROOT
  if (override !== undefined && override.trim().length > 0) roots.push(override)
  const dshHome = process.env.DSH_HOME
  roots.push(join(dshHome !== undefined && dshHome.trim().length > 0 ? dshHome : join(home, '.dsh'), 'sessions'))
  roots.push(join(home, '.flagqai', 'sessions'))
  return [...new Set(roots)]
}

function loadUpstreamDecoder(): StorageDecoder | undefined {
  try {
    const req = createRequire(import.meta.url)
    const mod = req('@deepseek-ai/dsh-session') as { decodeStorageRecord?: unknown }
    return typeof mod.decodeStorageRecord === 'function'
      ? mod.decodeStorageRecord as StorageDecoder
      : undefined
  } catch {
    // No resolvable dsh-session copy from this tree — the local decoder is
    // fully self-contained, so reads still work.
    return undefined
  }
}

/**
 * Register every {@link LEGACY_SESSION_EVENT_TYPES} type as known in EVERY
 * reachable KNOWN_SESSION_EVENT_TYPES copy, ahead of the strict read path
 * (`agents.resume` seed validation, `persistence.load`). Idempotent; never
 * throws.
 *
 * Why a walk instead of a single import: a runtime can load dsh-session
 * more than once (CLI tree vs profile tree, version overlap during
 * upgrades, pnpm peer-context splits), and the strict validator — which
 * lives in the dsh-session-persistence package — consults only ITS OWN
 * tree's copy. Registering through one import leaves the other trees'
 * copies untouched. So from EACH base anchor (this module = the flagqai
 * tree, the process entry point = the launcher/CLI tree) the walk
 * registers the tree's own dsh-session AND steps one edge further:
 * resolve the validator package from that same tree, then register the
 * dsh-session copy the validator's entry resolves. A branch that cannot
 * be resolved simply is not there; resolved module paths are deduped.
 */
export function ensureLegacySessionEventTypes(): void {
  const roots = [import.meta.url, process.argv[1]].filter(
    (anchor): anchor is string => typeof anchor === 'string' && anchor.length > 0,
  )
  const visitedAnchors = new Set<string>()
  const registeredCopies = new Set<string>()
  const walk = (anchor: string): void => {
    if (visitedAnchors.has(anchor)) return
    visitedAnchors.add(anchor)
    let req: ReturnType<typeof createRequire>
    try {
      req = createRequire(anchor)
    } catch {
      return
    }
    try {
      const copy = req.resolve('@deepseek-ai/dsh-session')
      if (!registeredCopies.has(copy)) {
        registeredCopies.add(copy)
        const mod = req(copy) as { KNOWN_SESSION_EVENT_TYPES?: Set<string> }
        for (const type of [...LEGACY_SESSION_EVENT_TYPES, 'flagqai/model-selected', 'flagqai/effort-selected', 'flagqai/plan-return']) {
          mod.KNOWN_SESSION_EVENT_TYPES?.add(type)
        }
      }
    } catch {
      // No resolvable dsh-session copy from this anchor — nothing here.
    }
    try {
      walk(req.resolve('@deepseek-ai/dsh-session-persistence'))
    } catch {
      // Validator package not reachable from this tree — nothing to cover.
    }
  }
  for (const root of roots) walk(root)
}

const access = createSessionLogAccess<SessionEvent>({ sessionsRoots, loadUpstreamDecoder })
export const { findSessionLogFile, resolveLocatedPath, defaultMaxScanned, readSessionEventsFromFile, readSessionEventsFromLog, readPhysicalHeaderSeedLength, readPhysicalHeaderSeedLengthForSession, readSessionTitleFromLog, userTitleData, appendSessionTitle, deleteSessionLog } = access
