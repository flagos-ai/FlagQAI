/** Native format and content bindings for the shared bounded child reader. */
import { SESSION_FORMAT_VERSION, type SessionEvent } from '@deepseek-ai/dsh-session'
import { textOfBlocks } from '../../channel/projection.js'
import { toolErrorText } from './transcript.js'
import { createChildTranscriptReader } from '#flagqai/harness-adapter/child-transcript'
import type {
  ChildPersistenceSource as SharedPersistenceSource,
  ChildPersistenceHandle as SharedPersistenceHandle,
  ChildTranscriptDeps as SharedTranscriptDeps,
} from '#flagqai/harness-adapter/child-transcript'
export { CHILD_TRANSCRIPT_PAGE_EVENTS } from '#flagqai/harness-adapter/child-transcript'
export type { ChildTranscriptCapture, ChildSessionsStore } from '#flagqai/harness-adapter/child-transcript'
export type ChildPersistenceSource = SharedPersistenceSource<SessionEvent>
export type ChildPersistenceHandle = SharedPersistenceHandle<SessionEvent>
export type ChildTranscriptDeps = SharedTranscriptDeps<SessionEvent>
export const readChildTranscriptPage = createChildTranscriptReader<SessionEvent>({
  formatVersion: SESSION_FORMAT_VERSION,
  textOfBlocks,
  toolErrorText: event => toolErrorText(event as SessionEvent<'tool/result'>),
})
