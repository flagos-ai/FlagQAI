import noop from 'lodash-es/noop.js'
import type { ReactElement } from 'react'
import { ConcurrentRoot } from 'react-reconciler/constants.js'
import { createNode } from './dom.js'
import { FocusManager } from './focus.js'
import Output from './output.js'
import reconciler, { dispatcher } from './reconciler.js'
import renderNodeToOutput, { resetLayoutShifted } from './render-node-to-output.js'
import {
  CellWidth,
  CharPool,
  cellAtIndex,
  createScreen,
  HyperlinkPool,
  type Screen,
  setCellStyleId,
  StylePool,
} from './screen.js'

export type MatchPosition = { row: number; col: number; len: number }

// Screen snapshots compare style IDs across calls, so their paint passes share
// one interning table. Each returned screen still owns its cell buffer.
const snapshotStyles = new StylePool()

/** Paint a React element into an isolated cell buffer for renderer checks. */
export function renderToScreen(element: ReactElement, width: number): { screen: Screen; height: number } {
  const columns = Math.max(0, Math.floor(width))
  const root = createNode('ink-root')
  root.focusManager = new FocusManager((target, event) => dispatcher.dispatchDiscrete(target, event))

  // The installed reconciler accepts ten arguments; its published types describe eleven.
  // @ts-ignore react-reconciler runtime/type definition mismatch
  const container = reconciler.createContainer(root, ConcurrentRoot, null, false, null, 'render-to-screen', noop, noop, noop, noop)
  // @ts-ignore updateContainerSync is available at runtime but absent from the declaration.
  reconciler.updateContainerSync(element, container, null, noop)
  // @ts-ignore flushSyncWork is available at runtime but absent from the declaration.
  reconciler.flushSyncWork()

  try {
    root.yogaNode?.calculateLayout(columns)
    const computed = root.yogaNode?.getComputedHeight()
    const height = computed !== undefined && Number.isFinite(computed)
      ? Math.max(0, Math.ceil(computed))
      : 0
    const screen = createScreen(columns, height, snapshotStyles, new CharPool(), new HyperlinkPool())
    if (height > 0) {
      const output = new Output({ width: columns, height, stylePool: snapshotStyles, screen })
      resetLayoutShifted()
      renderNodeToOutput(root, output, { prevScreen: undefined })
      output.get()
    }
    return { screen, height }
  } finally {
    // Release effects and subscriptions installed by the isolated React tree.
    // @ts-ignore updateContainerSync is available at runtime but absent from the declaration.
    reconciler.updateContainerSync(null, container, null, noop)
    // @ts-ignore flushSyncWork is available at runtime but absent from the declaration.
    reconciler.flushSyncWork()
  }
}

/** Search each painted row, retaining display-cell positions across wide glyphs. */
export function scanPositions(screen: Screen, query: string): MatchPosition[] {
  if (!query) return []
  const needle = query.toLowerCase()
  const matches: MatchPosition[] = []
  for (let row = 0; row < screen.height; row++) {
    let text = ''
    const columns: number[] = []
    for (let col = 0; col < screen.width; col++) {
      const index = row * screen.width + col
      const cell = cellAtIndex(screen, index)
      if (cell.width === CellWidth.SpacerTail || cell.width === CellWidth.SpacerHead || screen.noSelect[index] === 1) continue
      const lowered = cell.char.toLowerCase()
      text += lowered
      for (let unit = 0; unit < lowered.length; unit++) columns.push(col)
    }
    let from = 0
    while (from < text.length) {
      const start = text.indexOf(needle, from)
      if (start < 0) break
      const first = columns[start]
      const last = columns[start + needle.length - 1]
      if (first !== undefined && last !== undefined) {
        const tail = cellAtIndex(screen, row * screen.width + last)
        matches.push({ row, col: first, len: last - first + (tail.width === CellWidth.Wide ? 2 : 1) })
      }
      from = start + needle.length
    }
  }
  return matches
}

/** Overlay the active search result after ordinary search highlighting. */
export function applyPositionedHighlight(
  screen: Screen,
  stylePool: StylePool,
  positions: MatchPosition[],
  rowOffset: number,
  currentIdx: number,
): boolean {
  const position = positions[currentIdx]
  if (!position) return false
  const row = position.row + rowOffset
  if (row < 0 || row >= screen.height) return false
  let changed = false
  for (let col = position.col; col < position.col + position.len && col < screen.width; col++) {
    if (col < 0) continue
    const index = row * screen.width + col
    const cell = cellAtIndex(screen, index)
    if (screen.noSelect[index] === 1 || cell.width === CellWidth.SpacerTail || cell.width === CellWidth.SpacerHead) continue
    setCellStyleId(screen, col, row, stylePool.withCurrentMatch(cell.styleId))
    changed = true
  }
  return changed
}
