import assert from 'node:assert/strict'
import {
  appendChildNode, clearYogaNodeReferences, createNode, createTextNode,
  findOwnerChainAtRow, markTreeDirty, scheduleRenderFrom, setAttribute,
  setStyle, setTextNodeValue, setTextStyles,
} from '../src/ink/dom.js'
import { LayoutDisplay } from '../src/ink/layout/node.js'
import { textPaintCache } from '../src/ink/node-cache.js'

const root = createNode('ink-root')
const box = createNode('ink-box')
const text = createNode('ink-text')
const leaf = createTextNode('first')
appendChildNode(root, box)
appendChildNode(box, text)
appendChildNode(text, leaf)

root.dirty = box.dirty = text.dirty = false
setAttribute(box, 'children', 'ignored')
assert.equal(box.attributes.children, undefined)
assert.equal(root.dirty, false)
setAttribute(box, 'title', 'first')
assert.equal(root.dirty, true)
root.dirty = box.dirty = false
setAttribute(box, 'title', 'first')
assert.equal(root.dirty, false)

setStyle(box, { width: 20 })
root.dirty = box.dirty = false
setStyle(box, { width: 20 })
assert.equal(root.dirty, false, 'equivalent style does not schedule another frame')
setStyle(box, { width: 21 })
assert.equal(root.dirty, true)

root.dirty = box.dirty = text.dirty = false
setTextStyles(text, { bold: true })
assert.equal(root.dirty, true)
root.dirty = box.dirty = text.dirty = false
setTextStyles(text, { bold: true })
assert.equal(root.dirty, false)
setTextNodeValue(leaf, 'first')
assert.equal(root.dirty, false)
setTextNodeValue(leaf, 'second')
assert.equal(text.dirty, true)

let frames = 0
root.onRender = () => { frames++ }
scheduleRenderFrom(leaf)
assert.equal(frames, 1)

textPaintCache.set(text, {
  maxWidth: 20, background: undefined, paddingLeft: 0, paddingTop: 0,
  text: 'second', lines: ['second'], softWrap: undefined,
  decoration: undefined, noSelectRuns: undefined,
})
root.dirty = box.dirty = text.dirty = false
markTreeDirty(root)
assert.equal(root.dirty && box.dirty && text.dirty, true)
assert.equal(textPaintCache.has(text), false)

root.yogaNode!.setWidth(20)
root.yogaNode!.setHeight(5)
box.yogaNode!.setWidth(10)
box.yogaNode!.setHeight(3)
root.yogaNode!.calculateLayout(20)
root.debugOwnerChain = ['Root']
box.debugOwnerChain = ['Box', 'Root']
assert.deepEqual(findOwnerChainAtRow(root, 1), ['Box', 'Root'])
box.yogaNode!.setDisplay(LayoutDisplay.None)
root.yogaNode!.calculateLayout(20)
assert.deepEqual(findOwnerChainAtRow(root, 1), ['Root'])

clearYogaNodeReferences(root)
assert.equal(root.yogaNode, undefined)
assert.equal(box.yogaNode, undefined)
assert.equal(text.yogaNode, undefined)

console.log('Ink node state preserves no-op writes, dirty propagation, scheduling, owner lookup, and layout cleanup')
