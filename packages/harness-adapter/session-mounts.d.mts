// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
export interface SessionMountOwner {
  readonly pid: number; readonly startedAt: number; readonly sessionIds: readonly string[];
}
export type SessionOccupancy = { readonly kind: 'free' } | { readonly kind: 'mine' } | { readonly kind: 'occupied'; readonly pid: number };
export type MountFailure =
  | { readonly ok: false; readonly reason: 'occupied'; readonly holders: readonly number[] }
  | { readonly ok: false; readonly reason: 'busy' }
  | { readonly ok: false; readonly reason: 'unavailable'; readonly detail: string };
export type MountClaim = { readonly ok: true; readonly fresh: boolean } | MountFailure;
export type MountLedgerRead = { readonly ok: true; readonly owners: readonly SessionMountOwner[] } | { readonly ok: false; readonly detail: string };
export interface MountReservation { readonly settle: () => void; readonly abandon: () => void; }
export type MountReservationResult = { readonly ok: true; readonly reservation: MountReservation } | MountFailure;
/** Same-machine advisory guard; native session write locks remain authoritative. */
export interface SessionMountLedger {
  ownerIsSelf(owner: SessionMountOwner): boolean;
  pidAlive(pid: number): boolean;
  readMountLedger(): readonly SessionMountOwner[];
  readMountLedgerStrict(): MountLedgerRead;
  readSessionOwners(): ReadonlyMap<string, SessionMountOwner>;
  occupancyOf(sessionId: string, owners: ReadonlyMap<string, SessionMountOwner>): SessionOccupancy;
  publishMounts(sessionIds: Iterable<string>): boolean;
  claimMount(sessionId: string): MountClaim;
  releaseMount(sessionId: string): boolean;
  clearOwnMounts(): boolean;
  reserveNewSession(sessionId: string): Promise<{ readonly reservation: MountReservation; readonly failure?: MountFailure }>;
  ownMounts(): readonly string[];
  claimMountWithRetry(sessionId: string): Promise<MountClaim>;
  reserveMount(sessionId: string): Promise<MountReservationResult>;
}
/** Reuses one process-owned ledger per resolved data-directory path. */
export function createSessionMountLedger(options: { dataDir: string }): SessionMountLedger;
