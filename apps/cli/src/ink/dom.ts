import type { FocusManager } from './focus.js'
import { createLayoutNode } from './layout/engine.js'
import { LayoutMeasureMode, type LayoutNode } from './layout/node.js'
import type { Styles, TextStyles } from './styles.js'
import { lineWidth } from './line-width-cache.js'
import measureText from './measure-text.js'
import { noteMeasureCompute } from './render-stats.js'
import squashTextNodes from './squash-text-nodes.js'
import { decoratedWrapBudget, wrapDecoratedLine } from './text-decoration.js'
import { expandTabs } from './tabstops.js'
import wrapText from './wrap-text.js'

export type TextName = '#text'
export type ElementNames =
  | 'ink-root' | 'ink-box' | 'ink-text' | 'ink-virtual-text'
  | 'ink-link' | 'ink-progress' | 'ink-image' | 'ink-raw-ansi'
export type NodeNames = ElementNames | TextName
export type DOMNodeAttribute = boolean | string | number | Uint8Array | undefined

type NodeBase = {
  parentNode: DOMElement | undefined
  yogaNode?: LayoutNode
  style: Styles
}

export interface DOMElement extends NodeBase {
  nodeName: ElementNames
  attributes: Record<string, DOMNodeAttribute>
  childNodes: DOMNode[]
  textStyles?: TextStyles
  onComputeLayout?: () => void
  onRender?: () => void
  onImmediateRender?: () => void
  hasRenderedContent?: boolean
  dirty: boolean
  isHidden?: boolean
  _eventHandlers?: Record<string, unknown>
  scrollTop?: number
  pendingScrollDelta?: number
  scrollClampMin?: number
  scrollClampMax?: number
  scrollHeight?: number
  scrollViewportHeight?: number
  scrollViewportTop?: number
  scrollPrevMax?: number
  stickyScroll?: boolean
  onStickyRestore?: () => void
  onViewportHeightChange?: () => void
  scrollAnchor?: { el: DOMElement; offset: number }
  focusManager?: FocusManager
  debugOwnerChain?: string[]
}

export interface TextNode extends NodeBase {
  nodeName: TextName
  nodeValue: string
}

export type DOMNode<T = { nodeName: NodeNames }> =
  T extends { nodeName: infer Name }
    ? Name extends TextName ? TextNode : DOMElement
    : never

export { appendChildNode, insertBeforeNode, removeChildNode } from './tree-ops.js'
export { clearYogaNodeReferences, findOwnerChainAtRow, markDirty, markTreeDirty,
  scheduleRenderFrom, setAttribute, setStyle, setTextNodeValue, setTextStyles } from './node-state.js'

type Size = { width: number; height: number }
const MAX_MEASUREMENTS = 32

function longestLineWidth(text: string): number {
  let widest = 0
  for (const line of text.split('\n')) widest = Math.max(widest, lineWidth(line))
  return widest
}

function constrainedWidth(width: number, mode: LayoutMeasureMode, text: string): number {
  // Yoga asks for an intrinsic multiline width separately. A single
  // unbroken line still needs the available column budget to bound layout.
  if (mode === LayoutMeasureMode.Undefined && text.includes('\n')) return Infinity
  if (!Number.isFinite(width) || width <= 0) return Infinity
  return width >= 1 ? Math.floor(width) : width
}

function measurePlain(text: string, budget: number, style: Styles): Size {
  const natural = longestLineWidth(text)
  const truncate = style.textWrap?.startsWith('truncate') === true
  if (truncate) {
    const height = text === '' ? 0 : text.split('\n').length
    return { width: budget >= 1 ? Math.min(natural, budget) : natural, height }
  }
  const measured = measureText(text, budget)
  // Whole-word wrapping can leave unused cells at the end of each row.
  // Reserve the painter's actual rows rather than ceil(cellWidth / budget),
  // which clips later paragraphs and the final line of a long message.
  const height = budget >= 1 && Number.isFinite(budget) && text !== ''
    ? wrapText(text, budget, style.textWrap ?? 'wrap').split('\n').length
    : measured.height
  return {
    width: budget >= 1 ? Math.min(measured.width, budget) : measured.width,
    height,
  }
}

function measureDecorated(text: string, budget: number, style: Styles): Size {
  const decoration = style.decoration!
  const header = decoration.header
  let height = header === undefined ? 0 : 1
  const natural = longestLineWidth(text)
  let width = header === undefined ? 0 : lineWidth(header)
  if (text !== '') {
    const wrap = (line: string, columns: number): string => wrapText(line, columns, style.textWrap ?? 'wrap')
    const rowBudget = decoratedWrapBudget(decoration, budget)
    for (const rawLine of text.split('\n')) {
      const line = expandTabs(rawLine)
      const rows = wrapDecoratedLine(line, rawLine, budget, decoration, wrap)
      height += rows.length
      for (const row of rows) width = Math.max(width, lineWidth(row) + (decoration.prefix?.width ?? 0))
    }
    width = Math.max(width, Math.min(natural + (decoration.prefix?.width ?? 0), budget))
    if (!Number.isFinite(rowBudget)) width = Math.max(width, natural)
  }
  if (decoration.headerFill !== undefined && Number.isFinite(budget)) width = Math.max(width, budget)
  return { width: budget >= 1 ? Math.min(width, budget) : width, height }
}

function measureTextElement(node: DOMElement): (width: number, mode: LayoutMeasureMode) => Size {
  let previousText: string | undefined
  let previousStyle: Styles | undefined
  const results = new Map<string, Size>()

  return (width, mode) => {
    const text = squashTextNodes(node)
    if (text !== previousText || node.style !== previousStyle) {
      results.clear()
      previousText = text
      previousStyle = node.style
    }
    const key = `${width}:${mode}`
    const cached = results.get(key)
    if (cached) return cached
    noteMeasureCompute()
    const budget = constrainedWidth(width, mode, text)
    const normalized = expandTabs(text)
    const size = node.style.decoration
      ? measureDecorated(text, budget, node.style)
      : measurePlain(normalized, budget, node.style)
    if (results.size >= MAX_MEASUREMENTS) results.delete(results.keys().next().value!)
    results.set(key, size)
    return size
  }
}

export function createNode(nodeName: ElementNames): DOMElement {
  const node: DOMElement = {
    nodeName, parentNode: undefined, attributes: {}, childNodes: [], style: {}, dirty: false,
  }
  if (nodeName === 'ink-virtual-text' || nodeName === 'ink-link' || nodeName === 'ink-progress') {
    return node
  }
  const layout = createLayoutNode()
  node.yogaNode = layout
  if (nodeName === 'ink-text') {
    layout.setMeasureFunc(measureTextElement(node))
  } else if (nodeName === 'ink-raw-ansi') {
    layout.setMeasureFunc(() => ({
      width: Number(node.attributes.rawWidth) || 0,
      height: Number(node.attributes.rawHeight) || 0,
    }))
  }
  return node
}

export function createTextNode(text: string): TextNode {
  return { nodeName: '#text', nodeValue: text, parentNode: undefined, yogaNode: undefined, style: {} }
}
