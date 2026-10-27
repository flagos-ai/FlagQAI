import type App from './App.js'
import type { ParsedMouse } from '../parse-keypress.js'
import { DragEvent } from '../events/drag-event.js'
import { finishSelection, hasSelection } from '../selection.js'
import { isMouseClicksDisabled } from '../../utils/fullscreen.js'
import { isXtermJs } from '../terminal.js'

const MULTI_CLICK_WINDOW_MS = 500

/** Translate one terminal mouse report into the host's pointer callbacks.
 * Coordinates are terminal-cell indexes at this boundary; the parser's
 * wire coordinates are one-based. */
export function handleMouseEvent(app: App, report: ParsedMouse): void {
  const width = Math.max(1, app.props.terminalColumns)
  const height = Math.max(1, app.props.terminalRows)
  const col = Math.max(0, Math.min(width - 1, report.col - 1))
  const row = Math.max(0, Math.min(height - 1, report.row - 1))
  const button = report.button
  const physicalButton = button & 3
  const moving = (button & 0x20) !== 0
  const modifiers = button & (0x04 | 0x08 | 0x10)
  const hadLeftButton = (app.heldButtons & 1) !== 0
  const wasLatched = app.heldButtons !== 0 || app.ambiguousHeld
  const hadDormantDrag = app.dragSession !== null && app.dragSession.started === false

  // Tracking physical state is a transport concern, even if application
  // pointer actions are disabled. X10's generic release has no button id.
  if (report.action === 'release') {
    if (physicalButton === 3) {
      app.heldButtons = 0
      app.ambiguousHeld = true
    } else {
      app.heldButtons &= ~(1 << physicalButton)
      app.ambiguousHeld = false
    }
  } else if (moving && physicalButton === 3) {
    app.heldButtons = 0
    app.ambiguousHeld = false
  } else if (!moving && physicalButton !== 3) {
    app.heldButtons |= 1 << physicalButton
    app.ambiguousHeld = false
  }
  const isLatched = app.heldButtons !== 0 || app.ambiguousHeld
  app.props.onPointerGestureChange?.(isLatched)
  if (wasLatched && !isLatched) app.pendingReleaseTail = true

  if (isMouseClicksDisabled()) return

  if (moving) {
    if (physicalButton === 3) {
      if (app.props.selection.isDragging) {
        finishSelection(app.props.selection)
        app.props.onSelectionChange()
      }
      app.finishDragSession()
    }
    if (app.lastHoverCol !== col || app.lastHoverRow !== row) {
      app.lastHoverCol = col
      app.lastHoverRow = row
      app.props.onHoverAt(col, row)
    }
    if (app.dragSession && (app.heldButtons & 1) !== 0) {
      const drag = app.dragSession
      if ((col !== drag.startCol || row !== drag.startRow) &&
          (drag.lastCol !== col || drag.lastRow !== row)) {
        if (!drag.started) {
          app.props.onDragDispatch?.(drag.target, new DragEvent(
            'dragstart', col, row, drag.startCol, drag.startRow, { button },
          ))
          drag.started = true
        }
        app.props.onDragDispatch?.(drag.target, new DragEvent(
          'dragmove', col, row, drag.startCol, drag.startRow, { button },
        ))
        drag.lastCol = col
        drag.lastRow = row
      }
      return
    }
    if ((app.heldButtons & 1) !== 0 && app.props.selection.isDragging) {
      app.props.onSelectionDrag(col, row)
    }
    return
  }

  if (report.action === 'release') {
    const leftRelease = physicalButton === 0 ||
      (physicalButton === 3 && (hadLeftButton || app.dragSession !== null ||
        app.props.selection.isDragging))
    if (!leftRelease) return
    const completedDrag = app.dragSession?.started === true
    if (app.dragSession) {
      const drag = app.dragSession
      if (drag.started) app.props.onDragDispatch?.(drag.target, new DragEvent(
        'dragend', col, row, drag.startCol, drag.startRow, { button },
      ))
      app.dragSession = null
      if (!completedDrag) app.props.onSelectionStart(col, row)
    }
    if (app.props.selection.isDragging) {
      finishSelection(app.props.selection)
      app.props.onSelectionChange()
    }
    if (!completedDrag && (hadLeftButton || hadDormantDrag) &&
        !hasSelection(app.props.selection)) {
      app.pendingClickProbe = true
      const handled = app.props.onClickAt(col, row, button, true)
      if (!handled && app.clickCount === 1 && !hasSelection(app.props.selection)) {
        const url = app.props.getHyperlinkAt(col, row)
        if (url && process.env.TERM_PROGRAM !== 'vscode' && !isXtermJs()) {
          if (app.pendingHyperlinkTimer) clearTimeout(app.pendingHyperlinkTimer)
          app.pendingHyperlinkTimer = setTimeout(() => {
            app.pendingHyperlinkTimer = null
            app.props.onOpenHyperlink(url)
          }, MULTI_CLICK_WINDOW_MS)
        }
      }
    }
    return
  }

  if (physicalButton === 2) {
    app.props.onContextMenuAt(col, row, button)
    return
  }
  if (physicalButton !== 0) return

  if (app.dragSession) app.finishDragSession()

  if (app.pendingHyperlinkTimer) {
    clearTimeout(app.pendingHyperlinkTimer)
    app.pendingHyperlinkTimer = null
  }

  if (modifiers !== 0) {
    app.clickCount = 0
    app.lastClickTime = 0
    app.lastClickCol = -1
    app.lastClickRow = -1
    app.props.selection.lastPressHadAlt = (button & 0x08) !== 0
    app.props.onSelectionStart(col, row)
    app.props.onSelectionChange()
    return
  }

  const now = Date.now()
  const repeated = app.lastClickCol === col && app.lastClickRow === row &&
    now - app.lastClickTime < MULTI_CLICK_WINDOW_MS
  app.clickCount = repeated ? Math.min(app.clickCount + 1, 3) : 1
  app.lastClickTime = now
  app.lastClickCol = col
  app.lastClickRow = row

  if (app.clickCount === 2 || app.clickCount === 3) {
    app.props.onMultiClick(col, row, app.clickCount)
    return
  }
  if (modifiers === 0) {
    const target = app.props.onDragTargetAt?.(col, row)
    if (target) {
      app.dragSession = { target, startCol: col, startRow: row, lastCol: col, lastRow: row, started: false }
      app.clickCount = 0
      return
    }
  }
  app.props.selection.lastPressHadAlt = (button & 0x08) !== 0
  app.props.onSelectionStart(col, row)
  app.props.onSelectionChange()
}
