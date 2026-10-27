/** Native presentation effects around the shared, backend-neutral reducer. */
import { createChannelProjection as createSharedProjection } from '#flagqai/ui-core/projection'
import type { ProjectionState, ChannelProjectionDeps } from '#flagqai/ui-core/projection'
import { markChannelReadDirty } from '../adapter/channel/read-view.js'
import { t } from '../i18n.js'
import { logForDebugging } from '../utils/debug.js'
import { buildQuestionRecord, parseQuestionRecordAnswers, parseQuestionRecordQuestions } from './question-record.js'
import { cleanRenderText } from './sanitize.js'
export { textOfBlocks } from '#flagqai/ui-core/projection'
export type { ProjectionState, ProjectionRenderer, ChannelProjectionDeps } from '#flagqai/ui-core/projection'
export const nativeProjectionHost = { t, markChannelReadDirty, logForDebugging, cleanRenderText, buildQuestionRecord, parseQuestionRecordAnswers, parseQuestionRecordQuestions }
export function createChannelProjection(state: ProjectionState, deps: ChannelProjectionDeps) {
  return createSharedProjection(state, deps, nativeProjectionHost)
}
export type ChannelProjection = ReturnType<typeof createChannelProjection>
