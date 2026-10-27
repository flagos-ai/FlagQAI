import { stringWidth } from '../ink/stringWidth.js'
import { getGraphemeSegmenter } from '../utils/intl.js'

/** Pure UTF-16 offsets and terminal-cell geometry for the draft editor. */
export function graphemeBoundaries(text: string): number[] {
  const offsets = [0]
  for (const part of getGraphemeSegmenter().segment(text)) {
    const end = part.index + part.segment.length
    if (end > offsets[offsets.length - 1]) offsets.push(end)
  }
  return offsets
}

export function boundaryAtOrBefore(bounds: number[], offset: number): number {
  let lo = 0
  let hi = bounds.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (bounds[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return bounds[lo] ?? 0
}

export function previousGraphemeBoundary(bounds: number[], offset: number): number {
  if (bounds.length === 0) return 0
  return boundaryAtOrBefore(bounds, offset - 1)
}

export function nextGraphemeBoundary(bounds: number[], offset: number): number {
  for (const boundary of bounds) if (boundary > offset) return boundary
  return bounds.at(-1) ?? 0
}

export function normalizeCursorOffset(text: string, offset: number): number {
  const position = Number.isFinite(offset) ? Math.max(0, Math.min(text.length, offset)) : 0
  return boundaryAtOrBefore(graphemeBoundaries(text), position)
}

type Cluster = { start: number; end: number; value: string }

function clusters(text: string): Cluster[] {
  return Array.from(getGraphemeSegmenter().segment(text), part => ({
    start: part.index, end: part.index + part.segment.length, value: part.segment,
  }))
}

const isSpace = (value: string): boolean => /^\s+$/u.test(value)

export function wordBoundaryLeft(text: string, cursor: number): number {
  const items = clusters(text)
  let index = items.findIndex(item => item.end >= cursor)
  if (index < 0) index = items.length
  else if (items[index]?.start >= cursor) index--
  while (index >= 0 && isSpace(items[index].value)) index--
  if (index < 0) return 0
  while (index > 0 && !isSpace(items[index - 1].value)) index--
  return items[index].start
}

export function wordBoundaryRight(text: string, cursor: number): number {
  const items = clusters(text)
  let index = items.findIndex(item => item.end > cursor)
  if (index < 0) return text.length
  while (index < items.length && !isSpace(items[index].value)) index++
  while (index < items.length && isSpace(items[index].value)) index++
  return items[index]?.start ?? text.length
}

export function vimLineStart(text: string, cursor: number): number {
  return cursor <= 0 ? 0 : text.lastIndexOf('\n', cursor - 1) + 1
}

export function vimLineEnd(text: string, cursor: number): number {
  const next = text.indexOf('\n', Math.max(0, cursor))
  return next < 0 ? text.length : next
}

export function vimLineFirstNonBlank(text: string, cursor: number): number {
  let position = vimLineStart(text, cursor)
  const end = vimLineEnd(text, cursor)
  while (position < end && /[\t ]/u.test(text[position])) position++
  return position
}

export function vimWordForward(text: string, cursor: number): number {
  const items = clusters(text)
  let index = items.findIndex(item => item.end > cursor)
  if (index < 0) return text.length
  while (index < items.length && !isSpace(items[index].value)) index++
  while (index < items.length && isSpace(items[index].value)) index++
  return items[index]?.start ?? text.length
}

export function vimWordBackward(text: string, cursor: number): number {
  const items = clusters(text)
  let index = items.findIndex(item => item.end >= cursor)
  if (index < 0) index = items.length - 1
  else if (items[index].start >= cursor) index--
  while (index >= 0 && isSpace(items[index].value)) index--
  if (index < 0) return 0
  while (index > 0 && !isSpace(items[index - 1].value)) index--
  return items[index].start
}

export function vimWordEnd(text: string, cursor: number): number {
  const items = clusters(text)
  let index = items.findIndex(item => item.end > cursor)
  if (index < 0) return text.length
  while (index < items.length && !isSpace(items[index].value)) index++
  return items[index]?.start ?? text.length
}

export function wrapLineRows(line: string, width: number): Array<{ start: number; end: number }> {
  const limit = Math.max(1, Math.floor(width))
  const rows: Array<{ start: number; end: number }> = []
  let start = 0
  let used = 0
  let lastSpaceEnd = 0
  for (const item of clusters(line)) {
    const cells = Math.max(0, stringWidth(item.value))
    if (used > 0 && used + cells > limit) {
      if (lastSpaceEnd > start) {
        rows.push({ start, end: lastSpaceEnd })
        start = lastSpaceEnd
        used = stringWidth(line.slice(start, item.start))
      } else {
        rows.push({ start, end: item.start })
        start = item.start
        used = 0
      }
      lastSpaceEnd = 0
    }
    if (used > 0 && used + cells > limit) {
      rows.push({ start, end: item.start })
      start = item.start
      used = 0
    }
    used += cells
    if (/^\s+$/u.test(item.value)) lastSpaceEnd = item.end
  }
  rows.push({ start, end: line.length })
  return rows
}

export function wrapToWidth(text: string, width: number): string[] {
  return text.split('\n').flatMap(line =>
    wrapLineRows(line, width).map(row => line.slice(row.start, row.end)))
}

export function visualLineRanges(text: string, width: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let base = 0
  for (const line of text.split('\n')) {
    for (const row of wrapLineRows(line, width)) ranges.push([base + row.start, base + row.end])
    base += line.length + 1
  }
  return ranges
}

export function caretInText(
  text: string, width: number, offset: number,
): { line: number; charCol: number; visualCol: number } {
  const cursor = normalizeCursorOffset(text, offset)
  let base = 0
  let rowIndex = 0
  for (const line of text.split('\n')) {
    const rows = wrapLineRows(line, width)
    if (cursor <= base + line.length) {
      const local = cursor - base
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]
        if (local < row.end || index === rows.length - 1) {
          const charCol = Math.max(0, local - row.start)
          return { line: rowIndex + index, charCol, visualCol: stringWidth(line.slice(row.start, local)) }
        }
      }
    }
    base += line.length + 1
    rowIndex += rows.length
  }
  return { line: rowIndex, charCol: 0, visualCol: 0 }
}

export function clickToCursorOffset(
  text: string, width: number, visualLine: number, visualCol: number,
  snapWithin: 'nearest' | 'grapheme-start' = 'nearest',
): number {
  const rows = visualLineRanges(text, width)
  if (rows.length === 0) return 0
  const [start, end] = rows[Math.max(0, Math.min(rows.length - 1, visualLine))]
  let col = 0
  for (const item of clusters(text.slice(start, end))) {
    const cells = Math.max(0, stringWidth(item.value))
    if (visualCol < col + cells) {
      if (snapWithin === 'grapheme-start' || visualCol - col < cells / 2) return start + item.start
      return start + item.end
    }
    col += cells
  }
  return end
}

function selectionCharClass(value: string): 0 | 1 | 2 {
  if (/^\s+$/u.test(value)) return 0
  if (/[\p{L}\p{N}_/.\-+~\\]/u.test(value)) return 1
  return 2
}

export function wordSelectionAt(
  text: string, offset: number, lo: number, hi: number,
): { start: number; end: number } | null {
  const start = Math.max(0, Math.min(text.length, lo))
  const end = Math.max(start, Math.min(text.length, hi))
  const items = clusters(text.slice(start, end))
  if (items.length === 0) return null
  const local = Math.max(0, Math.min(end - start - 1, offset - start))
  let index = items.findIndex(item => item.end > local)
  if (index < 0) index = items.length - 1
  const kind = selectionCharClass(items[index].value)
  let first = index
  let last = index
  while (first > 0 && selectionCharClass(items[first - 1].value) === kind) first--
  while (last + 1 < items.length && selectionCharClass(items[last + 1].value) === kind) last++
  return { start: start + items[first].start, end: start + items[last].end }
}
