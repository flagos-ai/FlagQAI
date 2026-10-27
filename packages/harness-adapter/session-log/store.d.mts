// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
import type { TitleSource } from './digest-types.mjs';
/** Facts derived from a log at one revision. */
export interface DerivedEntry {
  readonly revision: string;
  /** Artifact size at this observation; append growth can retain older title evidence. */
  readonly bytes: number;
  /** Last-write time observed with this revision, for the revision-only path. */
  readonly modifiedAt: number | undefined;
  /** Physical file identity; a replacement invalidates append-only evidence. */
  readonly identity: string | undefined;
  /** Optional in older indexes; certifies only the physical-file-derived summary. */
  readonly artifactStamp?: string;
  /** Old EOF neighborhood hash, paired with the backend's append-only contract. */
  readonly anchor: string | undefined;
  readonly title: string;
  readonly titleSource: TitleSource;
  /** False keeps the same revision eligible for another progressive attempt. */
  readonly titleComplete: boolean;
  readonly hasPrompt: boolean;
  readonly model: string | undefined;
  /** Older caches lack this proof and are enriched even on a revision hit. */
  readonly modelComplete?: boolean;
  readonly label: string | undefined;
}
/** One session's cached record: derived facts plus this install's own notes. */
export interface IndexEntry {
  readonly derived: DerivedEntry | undefined;
  /** Git branch this install was on when it last used the session. */
  readonly branch: string | undefined;
}
/** The whole cache, session id → entry. */
export type SessionIndex = Map<string, IndexEntry>;
export interface SessionIndexStore {
  indexFileStamp(): string | undefined;
  readIndex(): SessionIndex;
  writeIndex(index: SessionIndex): void;
  noteBranch(sessionId: string, branch: string | undefined): void;
}
export declare function createSessionIndexStore(dataDirectory: string): SessionIndexStore;
