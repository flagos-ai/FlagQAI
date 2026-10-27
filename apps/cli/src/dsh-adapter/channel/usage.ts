import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { isTokenDelta as harnessIsTokenDelta } from '@deepseek-ai/dsh-llm/assistant-stream'

export { emptyTokenUsage, estimateTokens } from '../../channel/usage.js'

// Harness defines which stream chunks mark the first model output token.
export const isTokenDelta: (chunk: StreamChunk) => boolean = harnessIsTokenDelta

/** Character progress is only an estimate while a compaction stream runs. */
export function tokenDeltaChars(chunk: StreamChunk): number {
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return chunk.text.length
    case 'tool-call-delta':
      return (chunk.name?.length ?? 0) + chunk.argumentsDelta.length
    default:
      return 0
  }
}

/** Accept the provider's output count only when it is a usable measurement. */
export function usageOutputTokens(value: unknown): number | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const count = (value as { readonly outputTokens?: unknown }).outputTokens
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : undefined
}
