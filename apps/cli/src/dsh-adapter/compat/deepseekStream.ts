import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ConfiguredProvider } from '../../adapter/ports/channel-settings.js'
import { nativeDeepSeekHistory } from './deepseekReplay.js'

/** Targeted, pre-dispatch gateway compatibility; no retries or durable edits. */
export function deepSeekReplayStream(
  options: GenerateOptions,
  profiles: readonly ConfiguredProvider[] | undefined,
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
  next: () => AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  const target = profiles?.find(profile => profile.route === options.provider)
  const endpointRoot = (url: string | undefined) => url?.replace(/\/+$/, '').replace(/\/v1$/, '')
  const sameEndpointRoutes = target?.baseURL && target.ref.trim() && !target.hasCustomHeaders ? profiles?.filter(profile =>
    endpointRoot(profile.baseURL) === endpointRoot(target.baseURL) && profile.ref === target.ref
      && !profile.hasCustomHeaders,
  ).map(profile => profile.route) : undefined
  // This gateway's Anthropic bridge drops thinking on upstream replay, even
  // when our wire payload preserves it. Use its explicitly configured native
  // companion for DeepSeek only; never retry the failed request or tools.
  const requiresNative = target?.api === 'anthropic-messages'
    && endpointRoot(target.baseURL) === 'https://zyapi.xmsxb.com'
    && /^deepseek[-/]/i.test(options.model)
  const native = requiresNative ? profiles?.find(profile => profile.api === 'openai-completions'
      && sameEndpointRoutes?.includes(profile.route)
      && profile.models?.includes(options.model)) : undefined
  if (requiresNative && !native) return (async function* () {
    yield { type: 'finish', reason: { kind: 'error', failure: {
      code: 'PROVIDER_PROTOCOL_INCOMPATIBLE',
      message: 'This gateway cannot replay DeepSeek thinking over its Anthropic bridge. Configure a native Chat Completions connection on the same endpoint and credential before continuing. No model request was sent.',
    } } } as StreamChunk
  })()
  if (native) {
    const request = { ...options, provider: native.route, reasoningEffort: options.reasoningEffort ?? 'medium' } as GenerateOptions
    const messages = nativeDeepSeekHistory(request, native.api, sameEndpointRoutes)
    return (async function* (stream: AsyncIterable<StreamChunk>) {
      for await (const chunk of stream) {
        if (chunk.type !== 'finish' || !chunk.replayState) { yield chunk; continue }
        const state = chunk.replayState as unknown as { response: Record<string, unknown> }
        yield { ...chunk, replayState: { ...chunk.replayState,
          response: { ...state.response, provider: options.provider },
        } } as StreamChunk
      }
    })(stream({ ...request, messages }))
  }
  const messages = nativeDeepSeekHistory(options, target?.api, sameEndpointRoutes)
  if (messages === options.messages) return next()
  // The request is frozen by Harness. Re-enter once with a detached history;
  // the normalized replay API makes the second pass an identity operation.
  return stream({ ...options, messages } as GenerateOptions)
}
