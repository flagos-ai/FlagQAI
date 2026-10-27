import React from 'react'
import { marked } from 'marked'
import { Box } from '../ui.js'
import { t } from '../i18n.js'
import { Markdown, isStandaloneToken } from './Markdown.js'

type Part = { raw: string; gap: number; end: number; code: boolean }
type Partition = { parts: Part[]; hasDefinitions: boolean; cacheable: boolean }
const TEXT_CHUNK_BUDGET = 8192
const LONG_LINE_TAIL = 2048

function visibleSource(source: string): string {
  // A single unbroken live line can otherwise occupy hundreds of terminal
  // rows and push its newest text outside the viewport. Settled messages use
  // the complete source; this bound applies only to the live renderer.
  return source.split('\n').map(line => line.length > 10_000
    ? `${t('streaming-folded', { count: line.length - LONG_LINE_TAIL })}\n${line.slice(-LONG_LINE_TAIL)}`
    : line).join('\n')
}

function partsOf(source: string, prefix: Part[] = [], baseOffset = 0): Partition {
  const tokens = marked.lexer(source)
  const definitions = tokens.filter(token => token.type === 'def').map(token => token.raw).join('\n\n')
  const parts = prefix.slice()
  let text = ''
  let offset = baseOffset
  let previousCode = parts.at(-1)?.code ?? false
  let pendingCodeSpace = false
  const add = (raw: string, end: number, code = false, extraGap = 0): void => {
    if (!raw.trim()) return
    parts.push({ raw: definitions ? `${raw}\n\n${definitions}` : raw,
      gap: parts.length === 0 ? 0 : 1 + extraGap, end, code })
    previousCode = code
    pendingCodeSpace = false
  }
  const flush = (end: number): void => {
    add(text, end)
    text = ''
  }
  for (const token of tokens) {
    const start = offset
    offset += token.raw.length
    if (isStandaloneToken(token)) {
      const extraGap = previousCode && pendingCodeSpace && !text.trim() ? 1 : 0
      flush(start)
      add(token.raw, offset, token.type === 'code', extraGap)
    } else {
      if (token.type === 'space' && previousCode && !text.trim()) pendingCodeSpace = true
      text += token.raw
      if (text.length >= TEXT_CHUNK_BUDGET && token.type === 'space') flush(offset)
    }
  }
  flush(offset)
  return { parts, hasDefinitions: definitions.length > 0, cacheable: offset - baseOffset === source.length }
}

/** Keep completed blocks as separate memoized Markdown children while the tail grows. */
export function StreamingMarkdown({ children, dimColor = false }: {
  children: string
  dimColor?: boolean
}): React.ReactNode {
  const source = visibleSource(children.trim())
  const cached = React.useRef<{ source: string; partition: Partition } | null>(null)
  let partition: Partition
  if (cached.current?.source === source) {
    partition = cached.current.partition
  } else if (cached.current && cached.current.partition.cacheable &&
    !cached.current.partition.hasDefinitions) {
    // A stream may revise its final marker rather than append literally.
    // Reuse only chunks wholly before the shared prefix and hold back one
    // more boundary, since a following token can still alter the last block.
    let shared = 0
    const old = cached.current.source
    while (shared < source.length && shared < old.length && source.charCodeAt(shared) === old.charCodeAt(shared)) shared++
    const eligible = cached.current.partition.parts.filter(part => part.end < shared)
    const prefix = eligible.slice(0, -1)
    const cut = prefix.at(-1)?.end ?? 0
    const grown = partsOf(source.slice(cut), prefix, cut)
    partition = grown.hasDefinitions ? partsOf(source) : grown
  } else {
    partition = partsOf(source)
  }
  cached.current = { source, partition }
  const { parts } = partition
  return <Box flexDirection="column">{parts.map((part, index) =>
    <Box key={index} flexDirection="column" marginTop={part.gap}>
      <Markdown dimColor={dimColor} inlineMathImages={false}>{part.raw}</Markdown>
    </Box>)}</Box>
}
