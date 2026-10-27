// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
import type { SessionIndexStore, DerivedEntry } from './store.mjs';
export interface RecoveryWork {
  readonly id: string;
  readonly revision: string;
  readonly path: string;
  readonly bytes: number;
  readonly stamp: string;
  readonly priority: number;
  readonly listeners: Set<(derived: DerivedEntry) => void>;
}
export interface SessionMetadataRecovery {
  scheduleMetadataRecovery(work: Omit<RecoveryWork, 'listeners'>, onComplete?: (derived: DerivedEntry) => void): void;
  metadataRecoveryNeedsWork(id: string, revision: string, onComplete?: (derived: DerivedEntry) => void): boolean;
}
export declare function createSessionMetadataRecovery(store: SessionIndexStore): SessionMetadataRecovery;
export {};
