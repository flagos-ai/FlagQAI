// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
import type { SessionSource } from './list.mjs';
import type { SessionSummary } from './listing-types.mjs';
export interface SessionListingSnapshotStore {
  readListingSnapshot(source: SessionSource): readonly SessionSummary[] | undefined;
  beginListingSnapshot(source: SessionSource): (rows: readonly SessionSummary[]) => void;
}
export declare function createSessionListingSnapshotStore(dataDirectory: string): SessionListingSnapshotStore;
