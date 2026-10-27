/* eslint-disable custom-rules/no-top-level-side-effects */
/** React host adapter for the FlagQAI terminal tree. */
import { createContext } from 'react'
import createReconciler from 'react-reconciler'
import { isEnvTruthy } from '../utils/envUtils.js'
import {
  appendChildNode, clearYogaNodeReferences, createNode, createTextNode,
  insertBeforeNode, markDirty, removeChildNode, setAttribute, setStyle,
  setTextNodeValue, setTextStyles,
  type DOMElement, type DOMNode, type DOMNodeAttribute, type ElementNames,
  type TextNode,
} from './dom.js'
import { Dispatcher } from './events/dispatcher.js'
import { EVENT_HANDLER_PROPS } from './events/event-handlers.js'
import { getFocusManager, getRootNode } from './focus.js'
import applyLayout, { type Styles, type TextStyles } from './styles.js'

export const dispatcher = new Dispatcher()
const transitionContext = createContext<null>(null)
type HostContext = { readonly insideText: boolean }
const rootHostContext: HostContext = Object.freeze({ insideText: false })
const nestedTextContext: HostContext = Object.freeze({ insideText: true })
const debugRepaints = isEnvTruthy(process.env.FLAGQAI_DEBUG_REPAINTS)
let commitStartedAt = 0
let lastCommitMs = 0
let lastYogaMs = 0

export function isDebugRepaintsEnabled(): boolean { return debugRepaints }
export function recordYogaMs(ms: number): void { lastYogaMs = ms }
export function getLastYogaMs(): number { return lastYogaMs }
export function markCommitStart(): void { commitStartedAt = performance.now() }
export function getLastCommitMs(): number { return lastCommitMs }
export function resetProfileCounters(): void { lastYogaMs = 0; lastCommitMs = 0 }

/** Diagnostic names only; the React handle is never mutated. */
export function getOwnerChain(fiber: unknown): string[] {
  const names: string[] = []
  let cursor = fiber as { type?: unknown; return?: unknown } | null
  for (let depth = 0; cursor && depth < 80; depth++) {
    const type = cursor.type
    const name = typeof type === 'function'
      ? (type as { displayName?: string; name?: string }).displayName ?? type.name
      : typeof type === 'object' && type !== null
        ? (type as { displayName?: string }).displayName
        : undefined
    if (name) names.push(name)
    cursor = cursor.return as typeof cursor
  }
  return names
}

type Props = Record<string, unknown>
function ownStyle(value: unknown): Styles {
  return value && typeof value === 'object' ? value as Styles : {}
}
function updateLayout(node: DOMElement, before: Styles, after: Styles): void {
  const changed: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key as keyof Styles] !== after[key as keyof Styles]) changed[key] = after[key as keyof Styles]
  }
  if (Object.keys(changed).length && node.yogaNode) applyLayout(node.yogaNode, changed as Styles, after)
  setStyle(node, after)
}
function updateProps(node: DOMElement, before: Props, after: Props): void {
  updateLayout(node, ownStyle(before.style), ownStyle(after.style))
  if (node.nodeName === 'ink-text' || node.nodeName === 'ink-virtual-text') {
    setTextStyles(node, (after.textStyles ?? {}) as TextStyles)
  }
  const handlers = node._eventHandlers ?? {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'children' || key === 'style' || key === 'textStyles' || key === 'ref') continue
    if (EVENT_HANDLER_PROPS.has(key)) {
      if (after[key] === undefined) delete handlers[key]
      else handlers[key] = after[key]
    } else {
      setAttribute(node, key, after[key] as DOMNodeAttribute)
    }
  }
  node._eventHandlers = handlers
}
function asElement(node: DOMNode): DOMElement { return node as DOMElement }
function remove(parent: DOMElement, child: DOMNode): void {
  const root = parent.focusManager ? parent : getRootNode(parent)
  removeChildNode(parent, child)
  if (child.nodeName !== '#text') root.focusManager?.handleNodeRemoved(child, root)
  clearYogaNodeReferences(child)
}

const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsSingletons: false,
  supportsResources: false,
  isPrimaryRenderer: true,
  warnsIfNotActing: false,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getRootHostContext: () => rootHostContext,
  getChildHostContext: (parent: HostContext, type: ElementNames): HostContext =>
    type === 'ink-text' || type === 'ink-virtual-text'
      ? nestedTextContext
      : type === 'ink-link' ? parent : rootHostContext,
  getPublicInstance: (node: DOMNode) => node,
  getInstanceFromNode: () => null,
  getInstanceFromScope: () => null,
  prepareScopeUpdate: () => {},
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  preparePortalMount: () => {},
  detachDeletedInstance: () => {},
  shouldSetTextContent: () => false,
  finalizeInitialChildren: (_node: DOMElement, _type: ElementNames, props: Props) => props.autoFocus === true,
  commitMount: (node: DOMElement, _type: ElementNames, props: Props) => {
    if (props.autoFocus === true) getFocusManager(node).handleAutoFocus(node)
  },
  createInstance: (type: ElementNames, props: Props, _root: DOMElement, context: HostContext, fiber: unknown) => {
    const node = createNode(type === 'ink-text' && context.insideText ? 'ink-virtual-text' : type)
    if (debugRepaints) node.debugOwnerChain = getOwnerChain(fiber)
    updateProps(node, {}, props)
    return node
  },
  createTextInstance: (text: string) => createTextNode(text),
  appendInitialChild: (parent: DOMElement, child: DOMNode) => appendChildNode(parent, asElement(child)),
  appendChild: (parent: DOMElement, child: DOMNode) => appendChildNode(parent, asElement(child)),
  appendChildToContainer: (root: DOMElement, child: DOMNode) => appendChildNode(root, asElement(child)),
  insertBefore: (parent: DOMElement, child: DOMNode, before: DOMNode) => insertBeforeNode(parent, child, before),
  insertInContainerBefore: (root: DOMElement, child: DOMNode, before: DOMNode) => insertBeforeNode(root, child, before),
  removeChild: remove,
  removeChildFromContainer: remove,
  clearContainer: (root: DOMElement) => {
    for (const child of [...root.childNodes]) remove(root, child)
  },
  commitUpdate: (node: DOMElement, _type: ElementNames, before: Props, after: Props) => updateProps(node, before, after),
  commitTextUpdate: (node: TextNode, _before: string, after: string) => setTextNodeValue(node, after),
  hideInstance: (node: DOMElement) => { node.isHidden = true; markDirty(node) },
  unhideInstance: (node: DOMElement) => { node.isHidden = false; markDirty(node) },
  hideTextInstance: (node: TextNode) => {
    setTextNodeValue(node, '')
  },
  unhideTextInstance: (node: TextNode, text: string) => {
    setTextNodeValue(node, text)
  },
  prepareForCommit: () => { markCommitStart(); return null },
  resetAfterCommit: (root: DOMElement) => {
    root.onComputeLayout?.()
    lastCommitMs = commitStartedAt ? performance.now() - commitStartedAt : 0
    root.onRender?.()
  },
  getCurrentUpdatePriority: () => dispatcher.currentUpdatePriority,
  setCurrentUpdatePriority: (priority: number) => { dispatcher.currentUpdatePriority = priority },
  resolveUpdatePriority: () => dispatcher.resolveEventPriority(),
  resolveEventType: () => dispatcher.currentEvent?.type ?? null,
  resolveEventTimeStamp: () => dispatcher.currentEvent?.timeStamp ?? performance.now(),
  requestPostPaintCallback: (callback: (time: number) => void) => setTimeout(() => callback(performance.now()), 0),
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => {},
  resetFormInstance: () => {},
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: transitionContext as never,
  getSuspendedCommitReason: () => null,
  supportsTestSelectors: false,
}

const reconciler = createReconciler<
  ElementNames, Props, DOMElement, DOMElement, TextNode,
  never, never, never, DOMNode, HostContext, never,
  ReturnType<typeof setTimeout>, number, null
>(hostConfig)
dispatcher.discreteUpdates = reconciler.discreteUpdates.bind(reconciler)
export default reconciler
