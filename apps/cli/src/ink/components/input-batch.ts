import type App from './App.js'
import { InputEvent } from '../events/input-event.js'
import { TerminalFocusEvent } from '../events/terminal-focus-event.js'
import type { ParsedInput, ParsedKey } from '../parse-keypress.js'
import { finishSelection } from '../selection.js'
import { FOCUS_IN, FOCUS_OUT } from '../termio/csi.js'
import { updateLastInteractionTime } from '../../bootstrap/state.js'
import { isInputSuppressed } from '../input-suppression.js'
import { handleMouseEvent } from './pointer-host.js'
import { isMouseClicksDisabled } from '../../utils/fullscreen.js'
import { logMouseDebug } from '../../utils/debug.js'

/**
 * Deliver a parser batch in wire order. This module owns event routing only;
 * the parser, renderer and Harness session remain the authorities for their
 * respective state. The host invokes it inside one React discrete update.
 */
export function dispatchInputBatch(app: App, items: readonly ParsedInput[]): void {
  for (const item of items) {
    if (item.kind === 'response') {
      app.querier.onResponse(item.response)
      continue
    }

    if (item.kind === 'mouse') {
      if (process.env.FLAGQAI_DEBUG_MOUSE) {
        logMouseDebug('mouse arrive', {
          button: item.button, action: item.action, col: item.col, row: item.row,
          clicksDisabled: isMouseClicksDisabled(),
        })
      }
      // Unheld motion is passive pointer movement, not user engagement.
      if (!((item.button & 0x20) !== 0 && (item.button & 3) === 3)) {
        updateLastInteractionTime()
      }
      handleMouseEvent(app, item)
      continue
    }

    if (process.env.FLAGQAI_DEBUG_MOUSE) {
      if (item.name?.startsWith('wheel')) {
        logMouseDebug('wheel arrive', { name: item.name })
      } else {
        logMouseDebug('key arrive', {
          name: item.name,
          seq: (item.sequence ?? '').slice(0, 10),
        })
      }
    }
    if (item.sequence === FOCUS_IN || item.sequence === FOCUS_OUT) {
      dispatchFocus(app, item.sequence === FOCUS_IN)
      continue
    }

    updateLastInteractionTime()
    if (routeWheel(app, item)) continue

    const event = new InputEvent(item)
    app.handleInput(item.sequence)
    app.internal_eventEmitter.emit('input', event)
    if (!isInputSuppressed()) app.props.dispatchKeyboardEvent(item)
  }

  // A single stdin read can contain a release followed by another press.
  // Defer terminal probes until the entire read has established its final
  // pointer state, and let the host recheck the physical latch.
  if (app.pendingReleaseTail) {
    app.pendingReleaseTail = false
    app.props.onReleaseTail?.()
  }
  if (app.pendingFocusProbe) {
    app.pendingFocusProbe = false
    app.props.onTerminalFocus?.(true)
  }
  if (app.pendingClickProbe) {
    app.pendingClickProbe = false
    app.props.onClickProbe?.()
  }
}

function dispatchFocus(app: App, focused: boolean): void {
  app.handleTerminalFocus(focused)
  if (!focused) {
    app.heldButtons = 0
    app.ambiguousHeld = false
    app.props.onPointerGestureChange?.(false)
    app.finishDragSession()
    if (app.props.selection.isDragging) {
      finishSelection(app.props.selection)
      app.props.onSelectionChange()
    }
    app.pendingReleaseTail = true
    app.props.onTerminalFocus?.(false)
  } else {
    app.pendingFocusProbe = true
  }
  app.internal_eventEmitter.emit(
    focused ? 'terminalfocus' : 'terminalblur',
    new TerminalFocusEvent(focused ? 'terminalfocus' : 'terminalblur'),
  )
}

function routeWheel(app: App, key: ParsedKey): boolean {
  if (key.mouseCol === undefined || key.mouseRow === undefined) {
    return false
  }
  let deltaY = 0
  let deltaX = 0
  switch (key.name) {
    case 'wheelup': deltaY = -1; break
    case 'wheeldown': deltaY = 1; break
    case 'wheelleft': deltaX = -1; break
    case 'wheelright': deltaX = 1; break
    default: return false
  }
  return app.props.onWheelAt(
    key.mouseCol,
    key.mouseRow,
    deltaY,
    deltaX,
    key.mouseButton,
  )
}
