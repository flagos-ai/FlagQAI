/** Native data-directory binding for the shared derived session index. */
import { createSessionIndexStore } from '#flagqai/harness-adapter/session-log/store'
import { DATA_DIR } from '../../utils/paths.js'
export type { DerivedEntry, IndexEntry, SessionIndex } from '#flagqai/harness-adapter/session-log/store'
const store = createSessionIndexStore(DATA_DIR)
export const { indexFileStamp, readIndex, writeIndex, noteBranch } = store
