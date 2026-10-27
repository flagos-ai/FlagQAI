/**
 * Normalize the two persisted Harness tool-result shapes used by FlagQAI.
 * Current messages carry the result directly; older logs wrap one result in
 * a `tool-result` content block. Keep this translation at the log boundary.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

type ToolResultMessage = {
  readonly content?: readonly ContentBlock[]
  readonly isError?: boolean
}

type LegacyResultBlock = {
  readonly type: 'tool-result'
  readonly toolCallId?: string
  readonly content?: readonly ContentBlock[]
  readonly isError?: boolean
}

function legacyResult(block: unknown): LegacyResultBlock | undefined {
  if (typeof block !== 'object' || block === null) return undefined
  const candidate = block as { readonly type?: unknown }
  return candidate.type === 'tool-result' ? block as LegacyResultBlock : undefined
}

/** Extract displayable blocks and the failure flag from a persisted result. */
export function toolResultPayload(message: ToolResultMessage | undefined): {
  content: readonly ContentBlock[]
  isError: boolean
} {
  const content = message?.content ?? []
  const wrapped = content.length === 1 ? legacyResult(content[0]) : undefined
  return {
    content: Array.isArray(wrapped?.content) ? wrapped.content : content,
    isError: message?.isError === true || wrapped?.isError === true,
  }
}

/** Find calls settled by either a current tool message or a legacy block. */
export function answeredToolCallIds(message: {
  readonly role: string
  readonly toolCallId?: string
  readonly content: readonly ContentBlock[]
}): string[] {
  const ids: string[] = []
  if (message.role === 'tool' && message.toolCallId) ids.push(message.toolCallId)
  if (message.role === 'user' || message.role === 'tool') {
    for (const block of message.content) {
      const callId = legacyResult(block)?.toolCallId
      if (callId && !ids.includes(callId)) ids.push(callId)
    }
  }
  return ids
}

/** Recognize both persisted generations of compaction checkpoint messages. */
export function isCompactionCheckpointSource(source: { kind: string; plugin?: string }): boolean {
  return source.kind === 'compact-checkpoint' || (source.kind === 'plugin' && source.plugin === 'compact')
}
