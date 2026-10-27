/** File-reference tokens for the composer and the Harness attachment adapter. */
export interface MentionToken {
  start: number
  end: number
  path: string
  literal?: string
  startLine?: number
  endLine?: number
}

export interface CaretMention {
  start: number
  end: number
  query: string
  pathEnd?: number
}

type Candidate = MentionToken & {
  bodyStart: number
  bodyEnd: number
  pathEnd?: number
  quoted: boolean
}

const whitespace = (value: string) => /\s/u.test(value)
const rangeSuffix = /^(.+)#L(\d+)(?:-(\d+))?$/u

function lineRange(body: string) {
  const match = rangeSuffix.exec(body)
  if (!match) return undefined
  const startLine = Number(match[2])
  const endLine = match[3] === undefined ? startLine : Number(match[3])
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) ||
      startLine < 1 || endLine < startLine) return undefined
  return { path: match[1]!, literal: body, startLine, endLine,
    suffixOffset: match[1]!.length }
}

function candidates(text: string, includeOpenQuote: boolean): Candidate[] {
  const found: Candidate[] = []
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '@' || (start > 0 && !whitespace(text[start - 1]!))) continue
    const quoted = text[start + 1] === '"'
    const bodyStart = start + (quoted ? 2 : 1)
    if (bodyStart >= text.length && !includeOpenQuote) continue
    let bodyEnd = bodyStart
    let end = bodyStart
    let body: string
    if (quoted) {
      const close = text.indexOf('"', bodyStart)
      if (close < 0) {
        if (!includeOpenQuote) continue
        bodyEnd = end = text.length
        body = text.slice(bodyStart)
      } else {
        bodyEnd = close
        end = close + 1
        let wordEnd = end
        while (wordEnd < text.length && !whitespace(text[wordEnd]!)) wordEnd++
        const path = text.slice(bodyStart, close)
        const withTail = path + text.slice(end, wordEnd)
        // A closed quote ends the path. Only a valid line suffix extends it;
        // punctuation or a malformed suffix belongs to surrounding prose.
        if (lineRange(withTail)) {
          end = wordEnd
          body = withTail
        } else {
          body = path
        }
      }
    } else {
      while (end < text.length && !whitespace(text[end]!)) end++
      bodyEnd = end
      body = text.slice(bodyStart, end)
    }
    if (!body && !includeOpenQuote) continue
    const range = lineRange(body)
    const pathEnd = range === undefined ? undefined :
      quoted ? bodyStart + range.suffixOffset + 1 : bodyStart + range.suffixOffset
    found.push({
      start, end, bodyStart, bodyEnd, pathEnd, quoted,
      path: range?.path ?? body,
      ...(range === undefined ? {} : {
        literal: range.literal,
        startLine: range.startLine,
        endLine: range.endLine,
      }),
    })
    start = end - 1
  }
  return found
}

/** Return distinct references in source order; ranges are separate references. */
export function extractMentions(text: string): MentionToken[] {
  const seen = new Set<string>()
  const result: MentionToken[] = []
  for (const { bodyStart: _bodyStart, bodyEnd: _bodyEnd, pathEnd: _pathEnd,
    quoted: _quoted,
    ...token } of candidates(text, false)) {
    if (!_quoted && token.path.startsWith('@')) continue
    const key = text.slice(token.start, token.end)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(token)
  }
  return result
}

/** Return the editable path at a caret inside a mention, including partial quotes. */
export function mentionAtCaret(text: string, caret: number): CaretMention | undefined {
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return undefined
  for (const token of candidates(text, true)) {
    if (caret < token.start || caret > token.end) continue
    const queryEnd = Math.max(token.bodyStart,
      Math.min(caret, token.bodyEnd, token.pathEnd ?? token.bodyEnd))
    return {
      start: token.start,
      end: token.end,
      query: text.slice(token.bodyStart, queryEnd),
      ...(token.pathEnd === undefined ? {} : { pathEnd: token.pathEnd }),
    }
  }
  return undefined
}
