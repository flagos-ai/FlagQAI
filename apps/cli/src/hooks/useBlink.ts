import { useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { ClockContext } from '../ink/components/ClockContext.js'
import type { DOMElement } from '../ink/dom.js'
import { useTerminalFocus } from '../ink/hooks/use-terminal-focus.js'

const BLINK_INTERVAL_MS = 600

/** Return a stable box ref and a focus-aware, clock-driven visibility phase. */
export function useBlink(enabled = true): readonly [RefObject<DOMElement | null>, boolean] {
  const ref = useRef<DOMElement | null>(null)
  const clock = useContext(ClockContext)
  const focused = useTerminalFocus()
  const [elapsed, setElapsed] = useState(() => clock?.now() ?? 0)

  useEffect(() => {
    if (!enabled || !focused) return
    if (clock) return clock.subscribe(() => setElapsed(clock.now()), true)
    const started = performance.now()
    const timer = setInterval(() => setElapsed(performance.now() - started), BLINK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [clock, enabled, focused])

  const visible = !enabled || !focused || Math.floor(elapsed / BLINK_INTERVAL_MS) % 2 === 0
  return [ref, visible]
}
