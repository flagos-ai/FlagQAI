import type { DOMElement, DOMNode, DOMNodeAttribute, TextNode } from './dom.js'
import { LayoutDisplay } from './layout/node.js'
import { textPaintCache } from './node-cache.js'
import type { Styles, TextStyles } from './styles.js'

function sameFields<T extends object>(previous: T | undefined, next: T | undefined): boolean {
  if (previous === next) return true
  if (previous === undefined || next === undefined) return false
  const keys = Object.keys(previous) as (keyof T)[]
  if (keys.length !== Object.keys(next).length) return false
  return keys.every(key => previous[key] === next[key])
}

/** Dirty paint state propagates toward the document, while only the first
 * measured text ancestor needs a Yoga measurement invalidation. */
export function markDirty(start?: DOMNode): void {
  let cursor = start
  let measureInvalidated = false
  while (cursor !== undefined) {
    if (cursor.nodeName !== '#text') {
      cursor.dirty = true
      textPaintCache.delete(cursor)
      if (!measureInvalidated && cursor.yogaNode !== undefined &&
          (cursor.nodeName === 'ink-text' || cursor.nodeName === 'ink-raw-ansi')) {
        cursor.yogaNode.markDirty()
        measureInvalidated = true
      }
    }
    cursor = cursor.parentNode
  }
}

/** A viewport resize invalidates descendants even when no node changed. */
export function markTreeDirty(root?: DOMNode): void {
  if (root === undefined) return
  const pending: DOMNode[] = [root]
  while (pending.length > 0) {
    const node = pending.pop()!
    if (node.nodeName === '#text') continue
    node.dirty = true
    textPaintCache.delete(node)
    if (node.yogaNode !== undefined &&
        (node.nodeName === 'ink-text' || node.nodeName === 'ink-raw-ansi')) {
      node.yogaNode.markDirty()
    }
    pending.push(...node.childNodes)
  }
}

/** Request a frame through the document root's renderer callback. */
export function scheduleRenderFrom(node?: DOMNode): void {
  while (node?.parentNode !== undefined) node = node.parentNode
  if (node !== undefined && node.nodeName !== '#text') node.onRender?.()
}

export function setAttribute(node: DOMElement, key: string, value: DOMNodeAttribute): void {
  if (key === 'children' || node.attributes[key] === value) return
  node.attributes[key] = value
  markDirty(node)
}

export function setStyle(node: DOMNode, style: Styles): void {
  if (sameFields(node.style, style)) return
  node.style = style
  markDirty(node)
}

export function setTextStyles(node: DOMElement, styles: TextStyles): void {
  if (sameFields(node.textStyles, styles)) return
  node.textStyles = styles
  markDirty(node)
}

export function setTextNodeValue(node: TextNode, value: string): void {
  const text = typeof value === 'string' ? value : String(value)
  if (node.nodeValue === text) return
  node.nodeValue = text
  markDirty(node)
}

/** The layout engine frees entire subtrees, so discard every stale handle. */
export function clearYogaNodeReferences(root: DOMNode): void {
  const pending: DOMNode[] = [root]
  while (pending.length > 0) {
    const node = pending.pop()!
    if (node.nodeName !== '#text') pending.push(...node.childNodes)
    node.yogaNode = undefined
  }
}

/** Attribute a screen row to the deepest visible owner in debug mode. */
export function findOwnerChainAtRow(root: DOMElement, row: number): string[] {
  let owner: string[] = []
  const pending: Array<{ node: DOMElement; parentTop: number }> = [{ node: root, parentTop: 0 }]
  while (pending.length > 0) {
    const { node, parentTop } = pending.pop()!
    const layout = node.yogaNode
    if (layout === undefined || layout.getDisplay() === LayoutDisplay.None) continue
    const top = parentTop + layout.getComputedTop()
    if (row < top || row >= top + layout.getComputedHeight()) continue
    if (node.debugOwnerChain !== undefined) owner = node.debugOwnerChain
    for (let index = node.childNodes.length - 1; index >= 0; index--) {
      const child = node.childNodes[index]!
      if (child.nodeName !== '#text') pending.push({ node: child, parentTop: top })
    }
  }
  return owner
}
