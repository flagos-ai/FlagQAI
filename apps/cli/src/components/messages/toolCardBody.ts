import type { ToolCallView, ToolFileDiff, ToolResultView } from '../../dsh-adapter/channel.js'
import type { Theme } from '../../theme.js'
import { t } from '../../i18n.js'
import { primaryComboString } from '../../utils/keymap.js'
import { foldLongLines } from '../../utils/fold-long-lines.js'
import { isPatchDiff, parseFilePatch, patchHeader } from '../diffPatch.js'

export type BodyTone = 'add' | 'del' | 'dim' | 'plain' | 'error' | 'hint' | 'path' | 'live'

export type BodyLine = {
  readonly text: string
  readonly tone: BodyTone
  readonly revealOnHover?: boolean
  readonly target?: string
  readonly suffix?: string
}

export const TEXT_BODY_MAX_LINES = 3
export const DIFF_BODY_MAX_LINES = 8
export const SPLIT_DIFF_MIN_COLS = 110
export const VERBOSE_BODY_WINDOW = 400
export const GUTTER_FIRST = ' ⎿ '
export const GUTTER_REST = '   '

export const plain = (text: string): BodyLine => ({ text, tone: 'plain' })
export const dim = (text: string): BodyLine => ({ text, tone: 'dim' })

const fileWriters = new Set(['edit', 'write', 'multiedit', 'notebookedit'])
const executors = new Set(['bash', 'bashpersistent', 'sh', 'shell', 'terminal'])

export function toolNameColor(name: string, category?: 'mutate' | 'exec' | 'other'): keyof Theme {
  if (category === 'mutate' || (category === undefined && fileWriters.has(name.toLowerCase()))) return 'toolNameMutate'
  if (category === 'exec' || (category === undefined && executors.has(name.toLowerCase()))) return 'toolNameExec'
  return 'accent'
}

function linesOf(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function diffRows(files: readonly ToolFileDiff[]): BodyLine[] {
  const rows: BodyLine[] = []
  let lastPath: string | undefined
  for (const file of files) {
    if (isPatchDiff(file)) {
      const parsed = parseFilePatch(file)
      const header = patchHeader(file, parsed, files.length > 1)
      rows.push(header.kind === 'stat'
        ? dim(header.text)
        : { text: header.path, target: header.target, suffix: header.suffix, tone: 'path' })
      if (parsed.raw !== undefined) {
        rows.push(...parsed.raw.map(text => ({ text, tone: text[0] === '+' ? 'add' : text[0] === '-' ? 'del' : 'plain' } as BodyLine)))
        continue
      }
      const digits = String(parsed.maxLineNo).length
      parsed.hunks.forEach((hunk, index) => {
        if (index !== 0) rows.push(dim('⋯'))
        for (const line of hunk.lines) {
          const number = String(line.kind === 'del' ? line.oldNo : line.newNo).padStart(digits)
          const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
          rows.push({
            tone: line.kind === 'add' ? 'add' : line.kind === 'del' ? 'del' : 'plain',
            text: `${number} ${marker} ${line.text}`,
          })
        }
      })
      lastPath = file.path
      continue
    }
    if (files.length > 1) rows.push(file.path === lastPath ? dim('⋯') : { text: file.path, tone: 'path' })
    if (file.oldText !== null) rows.push(...linesOf(file.oldText).map(text => ({ text: `- ${text}`, tone: 'del' } as BodyLine)))
    rows.push(...linesOf(file.newText).map(text => ({ text: `+ ${text}`, tone: 'add' } as BodyLine)))
    lastPath = file.path
  }
  return rows
}

function contentRows(content: ReadonlyArray<{ readonly type: string; readonly text?: string }> | undefined): BodyLine[] {
  const text = (content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('').trimEnd()
  return text === '' ? [] : text.split('\n').map(plain)
}

export function viewLines(view: ToolCallView | ToolResultView): BodyLine[] {
  if (view.card === 'diff') return diffRows(view.diffs)
  if (view.card === 'terminal') {
    const output = 'output' in view ? view.output : undefined
    return linesOf(output?.trimEnd() ?? '').map(plain)
  }
  if (view.card === 'generic' || view.card === 'read') return contentRows('content' in view ? view.content : undefined)
  if (view.card === 'search') {
    const rows = view.shape === 'paths'
      ? view.paths.map(plain)
      : view.files.flatMap(file => [plain(file.path), ...file.matches.map(match => plain(`${match.lineNumber}: ${match.line}`))])
    if (view.truncated) rows.push(dim(view.shape === 'paths'
      ? t('search-results-total', { n: view.total })
      : `… (${view.total} total)`))
    return rows
  }
  return []
}

export function foldBodyLines(lines: BodyLine[]): { lines: BodyLine[]; hiddenChars: number } {
  let changed: BodyLine[] | undefined
  let hiddenChars = 0
  lines.forEach((line, index) => {
    const result = foldLongLines(line.text)
    if (result.hiddenChars > 0) {
      changed ??= lines.slice(0, index)
      changed.push({ ...line, text: result.text })
      hiddenChars += result.hiddenChars
    } else if (changed !== undefined) changed.push(line)
  })
  return { lines: changed ?? lines, hiddenChars }
}

function compactCount(n: number): string {
  if (n < 10_000) return String(n)
  return n < 10_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(1)}M`
}

export function capLines(lines: BodyLine[], max: number, verbose: boolean, hiddenChars: number): BodyLine[] {
  const hiddenLines = lines.length - max
  if (verbose || hiddenLines <= 1) return lines
  const key = primaryComboString('transcript')
  const parts = [
    t('tool-card-lines-unit', { n: hiddenLines }),
    ...(hiddenChars > 0 ? [t('tool-card-chars-unit', { n: compactCount(hiddenChars) })] : []),
  ]
  const hint = hiddenChars > 0
    ? t('tool-card-lines-hidden', { parts: parts.join(' · '), key })
    : t('lines-folded-expand', { n: hiddenLines, key })
  return [...lines.slice(0, max), { ...dim(hint), revealOnHover: true }]
}
