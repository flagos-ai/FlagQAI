import React, { useRef, type PropsWithChildren, type Ref } from 'react'
import type { Except } from 'type-fest'
import type { DOMElement } from '../dom.js'
import type { ClickEvent } from '../events/click-event.js'
import type { ContextMenuEvent } from '../events/context-menu-event.js'
import type { DragEvent } from '../events/drag-event.js'
import type { FocusEvent } from '../events/focus-event.js'
import type { KeyboardEvent } from '../events/keyboard-event.js'
import type { PointerEvent } from '../events/pointer-event.js'
import type { WheelEvent } from '../events/wheel-event.js'
import type { Styles } from '../styles.js'

export type Props = Except<Styles, 'textWrap'> & {
  ref?: Ref<DOMElement>
  tabIndex?: number
  autoFocus?: boolean
  onClick?: (event: ClickEvent) => void
  onContextMenu?: (event: ContextMenuEvent) => void
  onDragStart?: (event: DragEvent) => void
  onDragMove?: (event: DragEvent) => void
  onDragEnd?: (event: DragEvent) => void
  onWheel?: (event: WheelEvent) => void
  onFocus?: (event: FocusEvent) => void
  onFocusCapture?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onBlurCapture?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyDownCapture?: (event: KeyboardEvent) => void
  onMouseEnter?: (event: PointerEvent) => void
  onMouseLeave?: (event: PointerEvent) => void
}

function sameStyle(a: Styles, b: Styles): boolean {
  const keys = Object.keys(a) as (keyof Styles)[]
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key])
}

/** Flex layout container with renderer event forwarding. */
function Box({
  children, ref, tabIndex, autoFocus, onClick, onContextMenu,
  onDragStart, onDragMove, onDragEnd, onWheel,
  onFocus, onFocusCapture, onBlur, onBlurCapture,
  onKeyDown, onKeyDownCapture, onMouseEnter, onMouseLeave,
  flexDirection = 'row', flexWrap = 'nowrap', flexGrow = 0, flexShrink = 1,
  ...layout
}: PropsWithChildren<Props>): React.JSX.Element {
  const next: Styles = {
    ...layout,
    flexDirection, flexWrap, flexGrow, flexShrink,
    overflowX: layout.overflowX ?? layout.overflow ?? 'visible',
    overflowY: layout.overflowY ?? layout.overflow ?? 'visible',
  }
  const cached = useRef<Styles>(next)
  if (!sameStyle(cached.current, next)) cached.current = next

  return <ink-box
    ref={ref} style={cached.current} tabIndex={tabIndex} autoFocus={autoFocus}
    onClick={onClick} onContextMenu={onContextMenu}
    onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}
    onWheel={onWheel} onFocus={onFocus} onFocusCapture={onFocusCapture}
    onBlur={onBlur} onBlurCapture={onBlurCapture}
    onKeyDown={onKeyDown} onKeyDownCapture={onKeyDownCapture}
    onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
  >{children}</ink-box>
}

export default React.memo(Box)
