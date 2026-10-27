/** Native singleton binding for shared metadata recovery. */
import { createSessionMetadataRecovery } from '#flagqai/harness-adapter/session-log/recovery'
import * as store from './store.js'
export const { scheduleMetadataRecovery, metadataRecoveryNeedsWork } = createSessionMetadataRecovery(store)
