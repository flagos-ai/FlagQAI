/** Native path/history bindings for shared session listing. */
import { createSessionListing } from '#flagqai/harness-adapter/session-log/list'
import * as store from './store.js'
import * as snapshots from './snapshot.js'
import * as recovery from './recovery.js'
import { findSessionLogFile, resolveLocatedPath } from '../compat/sessionLog.js'
import { readLastUsed } from '../../sessionHistory.js'
export type { SessionSource } from '#flagqai/harness-adapter/session-log/list'
export const { enumerateSessions, listSummaries, locateSession } = createSessionListing({
  store, snapshots, recovery, findSessionLogFile, resolveLocatedPath, readLastUsed,
})
