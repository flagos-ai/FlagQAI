import type { GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'

/**
 * Bridge readable, unsigned DeepSeek history between explicitly trusted routes
 * on the same credential and endpoint. Never alter stored events,
 * another model's thinking, signed/encrypted blocks, or already-native history.
 * Retire when the Harness supports explicit same-model protocol migration.
 */
export function nativeDeepSeekHistory(options: GenerateOptions, api: unknown, sameEndpointRoutes: readonly string[] = [options.provider]): RequestMessage[] {
  if (api !== 'openai-completions' || !/^deepseek[-/]/i.test(options.model)) return options.messages
  let changed = false
  const messages = options.messages.map(message => {
    if (message.role !== 'assistant' || !sameEndpointRoutes.includes(message.source.provider) || message.source.model !== options.model) return message
    const raw = message.source.replayState
    if (raw === null || typeof raw !== 'object') return message
    const state = raw as { response?: Record<string, unknown>; blocks?: Record<string, unknown>[] }
    if (state.response?.kind !== 'pi-ai' || state.response.version !== 2
      || !['anthropic-messages', 'openai-completions'].includes(String(state.response.api))
      || state.response.provider !== message.source.provider || state.response.model !== options.model
      || !Array.isArray(state.blocks) || state.blocks.length !== message.content.length) return message
    if (state.response.api === 'openai-completions' && message.source.provider === options.provider) return message
    if (state.blocks.some((block, i) => !block || typeof block !== 'object' || block.type !== message.content[i]?.type
      || block.redacted || (block.thinkingSignature !== undefined && block.thinkingSignature !== '' && block.thinkingSignature !== 'reasoning_content')
      || block.thoughtSignature !== undefined)) return message
    changed = true
    return { ...message, source: { ...message.source, provider: options.provider, replayState: {
      ...state, response: { ...state.response, provider: options.provider, api: 'openai-completions' },
      blocks: state.blocks.map(block => block.type === 'reasoning'
        ? { ...block, thinkingSignature: 'reasoning_content' } : block),
    } } }
  })
  return changed ? messages : options.messages
}
