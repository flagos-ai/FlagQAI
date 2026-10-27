/** Native data-directory binding for shared listing snapshots. */
import { createSessionListingSnapshotStore } from '#flagqai/harness-adapter/session-log/snapshot'
import { DATA_DIR } from '../../utils/paths.js'
export const { readListingSnapshot, beginListingSnapshot } = createSessionListingSnapshotStore(DATA_DIR)
