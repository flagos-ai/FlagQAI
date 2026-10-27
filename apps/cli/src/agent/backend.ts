/**
 * Backend registry contract: how a backend is detected, how a session is
 * opened, and its offline catalog.
 */
import type { PreviewEntry, SessionSummary } from '../adapter/ports/channel-session.js'
import type { AgentSession } from './session.js'

/** What `detect()` found. Detection never throws: failures land here. */
export interface BackendDetection {
  readonly installed: boolean
  /**
   * Whether a credential the backend can use was found without a network
   * call: `unknown` when the backend cannot tell (a platform keychain).
   */
  readonly auth?: 'ok' | 'missing' | 'unknown'
  readonly version?: string
  /** A version outside the validated range (warn, never block). */
  readonly drift?: string
  /** How to install or sign in when unavailable. */
  readonly hint?: string
  /**
   * A missing credential can be supplied after the session opened (the
   * backend's own `/login`): the kernel picker keeps the row selectable and
   * says to sign in after start, instead of dimming it.
   */
  readonly loginInSession?: true
}

/** The stable subset of detection data consumed by terminal kernel choices. */
export type KernelStatus = Pick<BackendDetection, 'installed' | 'auth' | 'version' | 'loginInSession' | 'hint'>

/** Which session to open. */
export type OpenTarget =
  | { readonly kind: 'create'; readonly cwd: string }
  /** A persisted session of this backend. `cwd` narrows where the backend
   *  looks for it (absent = the session's own recorded directory, else
   *  every project the backend knows). */
  | { readonly kind: 'resume'; readonly sessionId: string; readonly cwd?: string }

/** Host-owned credential refs; token material never enters events or logs. */
export interface BackendTokenStore {
  read(ref: string): string | undefined
  write(ref: string, value: string): void
  erase(ref: string): void
  declared(ref: string): boolean
}

/** Host services a backend may use while detecting or opening. */
export interface BackendHost {
  readonly cwd: string
  /** Stored channel tokens, when the host provides its credential service. */
  readonly tokenStore?: BackendTokenStore
  /** Opt-in diagnostics; never stdout while the TUI renders. */
  debug(message: string): void
  /** User-visible warning (localized by the caller). */
  warn(message: string): void
  /** One line a backend child process wrote to stderr (never the terminal:
   *  the host logs it and folds repeats into notices). */
  stderr?(line: string): void
}

/** Where an offline listing looks. */
export interface SessionListScope {
  /** The project directory (and its worktrees, where the backend groups
   *  them); absent = the host's working directory. */
  readonly cwd?: string
  /** Every project the backend knows (`cwd` is then ignored). */
  readonly allProjects?: boolean
}

/**
 * A backend's offline session catalog: no session needs to be open. Rows
 * are the browser's own `SessionSummary` shape with `backendId` set. The
 * backend's own store stays authoritative; the TUI indexes nothing beyond
 * what the catalog itself caches.
 */
export interface SessionCatalog {
  list(scope?: SessionListScope): Promise<readonly SessionSummary[]>
  /** Durable session ids already loaded by this backend outside the current
   *  FlagQAI server. They must not be resumed concurrently. */
  occupiedIds?(scope?: SessionListScope): Promise<ReadonlySet<string>>
  /** One session's row, or undefined when the backend has no such session. */
  info?(sessionId: string, cwd?: string): Promise<SessionSummary | undefined>
  /** The trailing exchanges of a session (browser preview), newest last. */
  preview?(sessionId: string, options?: { readonly cwd?: string; readonly limit?: number }): Promise<readonly PreviewEntry[]>
  rename?(sessionId: string, title: string, cwd?: string): Promise<void>
  delete?(sessionId: string, cwd?: string): Promise<void>
  /** Omitted means deletion; archive keeps the backend's durable transcript. */
  readonly deleteAction?: 'archive'
}

/** Backend-scoped launcher marker and session browser usage notes. */
export interface BackendSessionPrefs {
  lastSession(): string | undefined
  setLastSession(sessionId: string): void
  touch(sessionId: string): void
  forget(sessionId: string): void
}

/** One agent backend. */
export interface AgentBackend {
  /** `dsh` | `claude` | `acp:<agent>`. */
  readonly id: string
  readonly descriptor: { readonly label: string }
  detect(host: BackendHost): Promise<BackendDetection>
  open(target: OpenTarget, host: BackendHost): Promise<AgentSession>
  readonly catalog?: SessionCatalog
  readonly launch?: {
    sessionPrefs(debug: (message: string) => void): BackendSessionPrefs
    resumeCommand(sessionId: string): string
  }
}
