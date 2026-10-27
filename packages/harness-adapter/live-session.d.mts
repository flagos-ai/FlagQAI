// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
export interface LiveSessionSeedMetadata {
  readonly meta: { readonly seedLength?: number; readonly isSeeded?: boolean };
  readonly inheritedEventCount?: number;
}
export interface LiveSessionListingFields {
  readonly id: string | undefined; readonly cwd: string | undefined;
  readonly createdAt: number | undefined; readonly parentSession: string | undefined;
  readonly origin: string | undefined; readonly delegationDepth: number | undefined;
  readonly agentPreset: string | undefined; readonly seedLength: number | undefined;
}
export interface NativeLiveEvent { readonly type: string; readonly seq: number; readonly time: number; readonly data: unknown; }
export interface LiveSessionCompatibility<Event extends NativeLiveEvent> {
  snapshotLiveSessionEvents(session: unknown): readonly Event[];
  liveSessionOffset(session: unknown): number;
  liveSessionPhysicalSeedLength(session: unknown): number | undefined;
  liveSessionListingFields(session: unknown): LiveSessionListingFields;
  sliceLiveSessionSeed(session: unknown, boundary?: number): Event[];
  liveSessionSeedMetadata(session: unknown, inheritedCount: number): LiveSessionSeedMetadata;
  appendInterruptedTurnEnd(seed: Event[], turn: number): void;
}
/** Read/slice decoded native logs; never invoke a native fork factory. */
export function createLiveSessionCompatibility<Event extends NativeLiveEvent>(bindings: {
  brandSessionLogOffset(value: number): number;
  makeInterruptedTurnEnd(seq: number, time: number, turn: number): Event;
}): LiveSessionCompatibility<Event>;
