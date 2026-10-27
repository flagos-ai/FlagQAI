import type { FileCandidate } from '../adapter/ports/channel-catalog.js'

export type { FileCandidate, FileCandidateKind } from '../adapter/ports/channel-catalog.js'

export interface FileSuggestionOptions {
  topK?: number
  maxFiles?: number
  maxDirectories?: number
}

/** A leading home/dot marker or either separator asks for path completion. */
export function isPathLikeQuery(query: string): boolean {
  return query.startsWith('.') || query.startsWith('~') || /[\\/]/u.test(query)
}

/** Case-insensitive subsequence ranking with an initial segment bonus. */
export function fuzzySubsequenceScore(query: string, candidate: string): number | undefined {
  if (!query) return 0
  const needle = query.toLowerCase()
  const haystack = candidate.toLowerCase()
  let cursor = 0
  let previous = -1
  let score = 0
  // Search UTF-16 units so existing emoji-path scores retain their ordering.
  for (let index = 0; index < needle.length; index++) {
    const letter = needle[index]!
    const position = haystack.indexOf(letter, cursor)
    if (position < 0) return undefined
    score += 10
    if (previous < 0) {
      score += position === 0 ? 20 : /[\\/._\-\s]/u.test(candidate[position - 1]!) ? 8 : 0
      score -= position
    } else {
      score -= position - previous - 1
    }
    previous = position
    cursor = position + 1
  }
  return score - candidate.length / 100
}

type Ranked = { file: FileCandidate; score: number; order: number }

/** Negative means the first candidate belongs earlier in the suggestion list. */
function compareRanked(a: Ranked, b: Ranked): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.file.kind !== b.file.kind) return a.file.kind === 'directory' ? -1 : 1
  return a.file.path.localeCompare(b.file.path) || a.order - b.order
}

function swap(heap: Ranked[], left: number, right: number): void {
  const item = heap[left]!
  heap[left] = heap[right]!
  heap[right] = item
}

/** Keep the worst retained candidate at the root of the bounded heap. */
function pushWorst(heap: Ranked[], entry: Ranked): void {
  heap.push(entry)
  for (let child = heap.length - 1; child > 0;) {
    const parent = Math.floor((child - 1) / 2)
    if (compareRanked(heap[child]!, heap[parent]!) <= 0) break
    swap(heap, child, parent)
    child = parent
  }
}

function restoreWorst(heap: Ranked[]): void {
  for (let parent = 0; ;) {
    const left = parent * 2 + 1
    if (left >= heap.length) return
    const right = left + 1
    const worst = right < heap.length && compareRanked(heap[right]!, heap[left]!) > 0 ? right : left
    if (compareRanked(heap[worst]!, heap[parent]!) <= 0) return
    swap(heap, parent, worst)
    parent = worst
  }
}

/** Rank a bounded visible set without sorting every file in a large workspace. */
export function rankFileCandidates(
  candidates: readonly FileCandidate[], query: string, topK = 50,
): FileCandidate[] {
  const limit = Math.max(0, Math.floor(topK))
  if (!(limit > 0)) return []
  const heap: Ranked[] = []
  for (const [order, file] of candidates.entries()) {
    const score = query ? fuzzySubsequenceScore(query, `${file.path} ${file.name}`) : 0
    if (score === undefined) continue
    const entry = { file, score, order }
    if (heap.length < limit) pushWorst(heap, entry)
    else if (compareRanked(entry, heap[0]!) < 0) {
      heap[0] = entry
      restoreWorst(heap)
    }
  }
  return heap.sort(compareRanked).map(({ file, score }) => ({ ...file, score }))
}

/** Keep the selected candidate by stable ID across refreshed rankings. */
export function preserveSelection(
  previous: FileCandidate | undefined, next: readonly FileCandidate[], fallback = 0,
): number {
  if (!next.length) return 0
  if (previous !== undefined) {
    const current = next.findIndex(file => file.id === previous.id)
    if (current >= 0) return current
  }
  return Math.max(0, Math.min(fallback, next.length - 1))
}
