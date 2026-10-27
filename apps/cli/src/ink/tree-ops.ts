import type { DOMElement, DOMNode } from './dom.js'
import { markDirty } from './node-state.js'
import { addPendingClear, nodeCache, pendingClears, textPaintCache } from './node-cache.js'

function layoutIndex(parent: DOMElement, childIndex: number): number {
  let index = 0
  for (let at = 0; at < childIndex; at++) {
    if (parent.childNodes[at]?.yogaNode !== undefined) index++
  }
  return index
}

function releasePaintCache(parent: DOMElement, node: DOMNode, underAbsolute = false): void {
  if (node.nodeName === '#text') return
  const isAbsolute = underAbsolute || node.style.position === 'absolute'
  const oldBounds = nodeCache.get(node)
  if (oldBounds !== undefined) addPendingClear(parent, oldBounds, isAbsolute)
  nodeCache.delete(node)
  textPaintCache.delete(node)
  pendingClears.delete(node)
  for (const child of node.childNodes) releasePaintCache(parent, child, isAbsolute)
}

function assertNoCycle(parent: DOMElement, child: DOMNode): void {
  for (let ancestor: DOMElement | undefined = parent; ancestor !== undefined; ancestor = ancestor.parentNode) {
    if (ancestor === child) throw new Error('Cannot add an ancestor as its own descendant')
  }
}

/** Move a node into its new DOM position and mirror that position in Yoga. */
export function insertBeforeNode(parent: DOMElement, child: DOMNode, before?: DOMNode): void {
  if (child === before) return
  assertNoCycle(parent, child)
  if (child.parentNode !== undefined) removeChildNode(child.parentNode, child)
  const anchorIndex = before === undefined ? -1 : parent.childNodes.indexOf(before)
  const index = anchorIndex < 0 ? parent.childNodes.length : anchorIndex
  parent.childNodes.splice(index, 0, child)
  child.parentNode = parent
  if (parent.yogaNode !== undefined && child.yogaNode !== undefined) {
    parent.yogaNode.insertChild(child.yogaNode, layoutIndex(parent, index))
  }
  markDirty(parent)
}

export function appendChildNode(parent: DOMElement, child: DOMNode): void {
  insertBeforeNode(parent, child)
}

/** Forget the detached paint and layout state before the next frame. */
export function removeChildNode(parent: DOMElement, child: DOMNode): void {
  const index = parent.childNodes.indexOf(child)
  if (index < 0) return
  parent.childNodes.splice(index, 1)
  if (parent.yogaNode !== undefined && child.yogaNode !== undefined) {
    parent.yogaNode.removeChild(child.yogaNode)
  }
  releasePaintCache(parent, child)
  child.parentNode = undefined
  markDirty(parent)
}
