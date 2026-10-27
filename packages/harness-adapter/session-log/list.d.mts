// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
import { type RawSessionHeader } from './header.mjs';
import type { SessionSummary } from './listing-types.mjs';
/**
 * The slice of `ctx.sessionPersistence` this module uses.
 *
 * Structural and fully optional: the service is resolved from a running
 * context whose packages may be a version apart from ours, and a listing that
 * degrades is worth more than one that throws.
 */
export interface SessionSource {
  /** Public provider configuration scopes optional disk snapshots. */
  readonly name?: string;
  readonly config?: unknown;
  /** Stable through Context proxies, unlike the service wrapper object. */
  readonly identity?: symbol;
  /** Headers plus per-log change tokens — the contract built for this. */
  listSnapshots?: (signal?: AbortSignal) => Promise<readonly unknown[]>;
  /** Headers alone, for a backend or version without snapshots. */
  list?: (signal?: AbortSignal) => Promise<readonly unknown[]>;
  /** Absolute artifact path for one header; absent for storeless backends. */
  locate?: (meta: unknown) => unknown;
}
/** A header paired with the backend's change token, when it offered one. */
export interface Listed {
  readonly header: RawSessionHeader;
  readonly raw: unknown;
  readonly revision: string | undefined;
}
import type { SessionIndexStore } from './store.mjs';
import type { SessionListingSnapshotStore } from './snapshot.mjs';
import type { SessionMetadataRecovery } from './recovery.mjs';
export interface SessionListingBindings {
  readonly store: SessionIndexStore;
  readonly snapshots: SessionListingSnapshotStore;
  readonly recovery: SessionMetadataRecovery;
  readLastUsed(): Readonly<Record<string, number>>;
  findSessionLogFile(id: string): string | undefined;
  resolveLocatedPath(path: string): {
    readonly path: string;
  } | undefined;
}
export interface SessionListing {
  enumerateSessions(source: SessionSource, signal?: AbortSignal): Promise<Listed[]>;
  listSummaries(source: SessionSource, signal?: AbortSignal, onEnriched?: (summary: SessionSummary) => void, onPartial?: (summaries: readonly SessionSummary[]) => void): Promise<readonly SessionSummary[]>;
  locateSession(source: SessionSource, sessionId: string, signal?: AbortSignal): Promise<string | undefined>;
}
export declare function createSessionListing(bindings: SessionListingBindings): SessionListing;
export {};
