// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
export interface SessionLogFile { readonly path: string; readonly compressed: boolean; }
/** An existing decoded log; only an absent/vanished file returns undefined. */
export interface SessionLogRead<Event> {
  readonly events: readonly Event[];
  readonly formatVersion?: number;
  readonly complete: boolean;
  readonly scanned: number;
  /** Corrupt/over-budget encoding must never trigger an unbounded fallback. */
  readonly failed?: boolean;
}
export interface SessionLogAccess<Event> {
  findSessionLogFile(sessionId: string): string | undefined;
  resolveLocatedPath(hint: string): SessionLogFile | undefined;
  defaultMaxScanned(maxEvents: number): number;
  readSessionEventsFromFile(path: string, maxEvents?: number, maxScanned?: number, skipBelowSeq?: number): SessionLogRead<Event> | undefined;
  readSessionEventsFromLog(sessionId: string, maxEvents?: number, maxScanned?: number, skipBelowSeq?: number): SessionLogRead<Event> | undefined;
  readPhysicalHeaderSeedLength(path: string): number | undefined;
  readPhysicalHeaderSeedLengthForSession(sessionId: string): number | undefined;
  readSessionTitleFromLog(sessionId: string): { title?: string; hasUserMessage: boolean } | undefined;
  userTitleData(title: string): { title: string; messageSeqs: number[]; source: { kind: 'user' } };
  appendSessionTitle(sessionId: string, title: string): 'appended' | 'unavailable';
  deleteSessionLog(sessionId: string): 'deleted' | 'unavailable';
}
/** Roots are read at call time; a native decoder is lazily bound per instance. */
export function createSessionLogAccess<Event>(bindings: {
  sessionsRoots(): readonly string[];
  loadUpstreamDecoder(): ((value: unknown) => Event[]) | undefined;
}): SessionLogAccess<Event>;
