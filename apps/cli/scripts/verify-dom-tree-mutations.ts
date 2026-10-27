import assert from 'node:assert/strict'
import {
  appendChildNode, createNode, createTextNode, insertBeforeNode, removeChildNode, setStyle,
} from '../src/ink/dom.js'
import { consumeAbsoluteRemovedFlag, nodeCache, pendingClears } from '../src/ink/node-cache.js'

const root = createNode('ink-root')
const left = createNode('ink-box')
const right = createNode('ink-box')
appendChildNode(root, left)
appendChildNode(root, right)
assert.deepEqual(root.childNodes, [left, right])
assert.equal(root.yogaNode?.getChildCount(), 2)
assert.equal(left.parentNode, root)

// A reparent and an in-place reorder must not duplicate a layout child.
appendChildNode(right, left)
assert.deepEqual(root.childNodes, [right])
assert.deepEqual(right.childNodes, [left])
assert.equal(root.yogaNode?.getChildCount(), 1)
assert.equal(right.yogaNode?.getChildCount(), 1)
assert.equal(left.parentNode, right)

const first = createNode('ink-text')
const second = createNode('ink-text')
appendChildNode(right, first)
appendChildNode(right, second)
insertBeforeNode(right, second, first)
assert.deepEqual(right.childNodes, [left, second, first])
assert.equal(right.yogaNode?.getChildCount(), 3)

// Inline text has no independent flex node, but still belongs to its parent.
const text = createTextNode('inside')
appendChildNode(first, text)
assert.equal(text.parentNode, first)
assert.equal(first.yogaNode?.getChildCount(), 0)

// Removing an already painted absolute child must clear its old pixels and
// forbid a stale previous-frame blit from putting them back.
setStyle(second, { position: 'absolute' })
const lastPaint = { x: 2, y: 3, width: 7, height: 1 }
nodeCache.set(second, lastPaint)
removeChildNode(right, second)
assert.equal(second.parentNode, undefined)
assert.deepEqual(right.childNodes, [left, first])
assert.equal(right.yogaNode?.getChildCount(), 2)
assert.equal(nodeCache.has(second), false)
assert.deepEqual(pendingClears.get(right), [lastPaint])
assert.equal(consumeAbsoluteRemovedFlag(), true)
assert.equal(consumeAbsoluteRemovedFlag(), false)

// A removed subtree can contain painted descendants outside its own bounds.
const nested = createNode('ink-box')
const overlay = createNode('ink-box')
const overlayText = createNode('ink-text')
appendChildNode(root, nested)
appendChildNode(nested, overlay)
appendChildNode(overlay, overlayText)
setStyle(overlay, { position: 'absolute' })
const nestedBounds = { x: 0, y: 0, width: 10, height: 2 }
const overlayBounds = { x: 20, y: 5, width: 5, height: 3 }
const textBounds = { x: 21, y: 6, width: 3, height: 1 }
nodeCache.set(nested, nestedBounds)
nodeCache.set(overlay, overlayBounds)
nodeCache.set(overlayText, textBounds)
removeChildNode(root, nested)
assert.deepEqual(pendingClears.get(root), [nestedBounds, overlayBounds, textBounds])
assert.equal(nodeCache.has(nested), false)
assert.equal(nodeCache.has(overlay), false)
assert.equal(nodeCache.has(overlayText), false)
assert.equal(consumeAbsoluteRemovedFlag(), true)

// An unknown anchor is treated as an append by the terminal reconciler.
const unknownAnchor = createNode('ink-box')
insertBeforeNode(root, nested, unknownAnchor)
assert.equal(root.childNodes.at(-1), nested)

console.log('DOM tree mutations preserve ownership, layout order, and removed-overlay clearing')
