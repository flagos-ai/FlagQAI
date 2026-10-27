/** Native data-directory binding for the shared cross-process mount ledger. */
import { DATA_DIR } from './utils/paths.js'
import { createSessionMountLedger } from '#flagqai/harness-adapter/session-mounts'
export type { SessionMountOwner, SessionOccupancy, MountFailure, MountClaim, MountLedgerRead,
  MountReservation, MountReservationResult } from '#flagqai/harness-adapter/session-mounts'
const ledger = createSessionMountLedger({ dataDir: DATA_DIR })
export const { ownerIsSelf, pidAlive, readMountLedger, readMountLedgerStrict, readSessionOwners, occupancyOf, publishMounts, claimMount, releaseMount, clearOwnMounts, reserveNewSession, ownMounts, claimMountWithRetry, reserveMount } = ledger
