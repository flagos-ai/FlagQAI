/** Exercise React's real terminal commit path without starting an Agent. */
import assert from 'node:assert/strict'
import React from 'react'
import { ConcurrentRoot } from 'react-reconciler/constants.js'
import { createNode, type DOMElement } from '../src/ink/dom.js'
import { FocusManager } from '../src/ink/focus.js'
import reconciler, { dispatcher, getLastCommitMs, getOwnerChain } from '../src/ink/reconciler.js'

const root = createNode('ink-root')
root.focusManager = new FocusManager((target, event) => dispatcher.dispatchDiscrete(target, event))
let layoutCommits = 0
let paintCommits = 0
root.onComputeLayout = () => { layoutCommits++ }
root.onRender = () => { paintCommits++ }
const noop = () => {}
// @ts-ignore published types declare one more callback than the installed runtime
const container = reconciler.createContainer(root, ConcurrentRoot, null, false, null, 'host-contract', noop, noop, noop, noop)
function update(element: React.ReactNode): void {
  // @ts-ignore runtime sync API omitted from published types
  reconciler.updateContainerSync(element, container, null, noop)
  // @ts-ignore runtime sync API omitted from published types
  reconciler.flushSyncWork()
}

let instance: DOMElement | null = null
const onClick = () => {}
update(React.createElement('ink-box', {
  ref: (node: DOMElement | null) => { instance = node },
  style: { width: 10 }, tabIndex: 0, autoFocus: true, onClick,
}, React.createElement('ink-text', null, 'ready')))
assert.equal(root.childNodes.length, 1)
assert.equal(root.childNodes[0], instance)
assert.equal(instance?.style.width, 10)
assert.equal(instance?._eventHandlers?.onClick, onClick)
assert.equal(root.focusManager.activeElement, instance)
assert.equal(instance?.childNodes[0]?.childNodes[0]?.nodeValue, 'ready')
assert.equal(layoutCommits, 1)
assert.equal(paintCommits, 1)

update(React.createElement('ink-box', {
  ref: (node: DOMElement | null) => { instance = node },
  style: { width: 15 }, tabIndex: 0,
}, React.createElement('ink-text', null, 'updated')))
assert.equal(root.childNodes.length, 1)
assert.equal(instance?.style.width, 15)
assert.equal(instance?._eventHandlers?.onClick, undefined)
assert.equal(instance?.childNodes[0]?.childNodes[0]?.nodeValue, 'updated')
assert.equal(layoutCommits, 2)
assert.equal(paintCommits, 2)

update(null)
assert.equal(root.childNodes.length, 0)
assert.equal(root.focusManager.activeElement, null)
assert.equal(layoutCommits, 3)
assert.equal(paintCommits, 3)
update(React.createElement('ink-box', null,
  React.createElement('ink-text', null, 'prefix ',
    React.createElement('ink-text', { textStyles: { bold: true } }, 'nested'),
    React.createElement('ink-link', { href: 'https://example.test' },
      React.createElement('ink-text', null, 'linked'))),
  React.createElement('ink-text', null, 'sibling')))
const [outerText, siblingText] = root.childNodes[0]!.childNodes as DOMElement[]
const nestedText = outerText!.childNodes[1] as DOMElement
assert.equal(outerText!.nodeName, 'ink-text')
assert.equal(nestedText.nodeName, 'ink-virtual-text')
assert.equal(nestedText.yogaNode, undefined, 'nested text must not claim a separate flex width')
assert.equal(nestedText.textStyles?.bold, true)
assert.equal((outerText!.childNodes[2] as DOMElement).childNodes[0]?.nodeName, 'ink-virtual-text',
  'inline links preserve the surrounding text context')
assert.equal(siblingText!.nodeName, 'ink-text', 'text context must not leak to siblings')
update(null)
assert.ok(getLastCommitMs() >= 0)
assert.deepEqual(getOwnerChain({ type: function Child() {}, return: { type: function Parent() {}, return: null } }), ['Child', 'Parent'])
console.log('ink reconciler contract passed (mount, mutation, nested text, focus, unmount, commit scheduling, diagnostics)')
