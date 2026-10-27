// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
import type { PreviewEntry, SessionDigest, SessionTitle } from './digest-types.mjs';
/** Head window budget. Eight times the measured worst-case prompt offset. */
export declare const HEAD_WINDOW_BYTES: number;
/** Head frame ceiling — a cost bound independent of how the bytes compress. */
export declare const HEAD_MAX_FRAMES = 128;
/** Tail window budget. Wider than the head: trailing frames carry payloads. */
export declare const TAIL_WINDOW_BYTES: number;
/**
 * Read both windows of one session log.
 *
 * @param path - Absolute artifact path.
 * @param cwd - Working directory, for the last-resort title.
 * @returns The digest. An unreadable log still yields a usable record: the
 *   title falls back to the directory basename and says so through its source.
 */
export declare function digestSession(path: string, cwd: string): SessionDigest;
export interface SessionTitleRecovery {
  readonly title: SessionTitle | undefined;
  /** False means a damaged/oversized frame prevented a conclusive answer. */
  readonly complete: boolean;
  /** Known only when a full no-title scan then reached/ruled out the prompt. */
  readonly hasPrompt?: boolean;
}
export interface SessionModelRecovery {
  readonly model: string | undefined;
  readonly complete: boolean;
}
export interface AppendedDigest {
  readonly title: SessionTitle | undefined;
  readonly model: string | undefined;
  readonly label: string | undefined;
  readonly hasHumanPrompt: boolean;
  /** Only a fully decoded suffix may be folded onto cached prefix facts. */
  readonly complete: boolean;
}
/** Scan all newly appended frames from the previous EOF frame boundary. */
export declare function digestAppendedSuffix(path: string, start: number, end: number, signal?: AbortSignal): Promise<AppendedDigest>;
/**
 * Recover the requested display facts for one immutable file snapshot in a
 * single reverse pass: the LAST title and/or route, then (only when no title
 * exists) a forward scan for the FIRST human prompt. Pages stay on verified
 * frame boundaries.
 */
export declare function recoverSessionMetadata(path: string, bytes: number, want: {
  readonly title: boolean;
  readonly model: boolean;
}, signal?: AbortSignal): Promise<{
  title?: SessionTitleRecovery;
  model?: SessionModelRecovery;
}>;
/** Title-only recovery; see {@link recoverSessionMetadata}. */
export declare function recoverSessionTitle(path: string, bytes: number, signal?: AbortSignal): Promise<SessionTitleRecovery>;
/** Route-only recovery; absence is proven only by a complete scan reaching the session header. */
export declare function recoverSessionModel(path: string, bytes: number, signal?: AbortSignal): Promise<SessionModelRecovery>;
/** Hash the previous EOF neighborhood; this detects replacement near the old tail. */
export declare function sessionTitleAnchor(path: string, bytes: number, signal?: AbortSignal): Promise<string | undefined>;
/**
 * The last exchanges of a session, for the browser's preview pane.
 *
 * Bounded like everything else here: the preview shows the end of the
 * conversation because that is what the tail window holds, and because the end
 * is what tells you whether this is the session you meant.
 *
 * @param path - Absolute artifact path.
 * @param limit - How many entries to keep, newest last.
 * @returns Entries in log order.
 */
export declare function previewSession(path: string, limit: number): PreviewEntry[];
