import React, { createContext, useEffect, useState, useSyncExternalStore } from 'react'
import { FRAME_INTERVAL_MS } from '../constants.js'
import { getTerminalFocused, subscribeTerminalFocus } from '../terminal-focus-state.js'

export type Clock = {
  subscribe: (onChange: () => void, keepAlive: boolean) => () => void
  now: () => number
  setTickInterval: (ms: number) => void
  suspend: (ms: number) => void
}

type Listener = { onChange: () => void; keepAlive: boolean }
const BLURRED_INTERVAL_MS = 250

/** A single elapsed clock shared by visible animations and passive counters. */
export function createClock(tickIntervalMs: number): Clock {
  const startedAt = performance.now()
  const listeners = new Set<Listener>()
  let interval = Math.max(1, tickIntervalMs)
  let timer: ReturnType<typeof setInterval> | undefined
  let keepAliveCount = 0
  let suspendedUntil = 0
  let lastElapsed = 0

  const now = (): number => {
    lastElapsed = Math.max(lastElapsed, performance.now() - startedAt)
    return lastElapsed
  }

  const tick = (): void => {
    if (now() < suspendedUntil) return
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener.onChange()
    }
  }

  const reconcileTimer = (): void => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
    if (keepAliveCount > 0) timer = setInterval(tick, interval)
  }

  return {
    now,
    subscribe(onChange, keepAlive) {
      const listener = { onChange, keepAlive }
      listeners.add(listener)
      if (keepAlive && ++keepAliveCount === 1) reconcileTimer()
      let subscribed = true
      return () => {
        if (!subscribed) return
        subscribed = false
        listeners.delete(listener)
        if (keepAlive && --keepAliveCount === 0) reconcileTimer()
      }
    },
    setTickInterval(ms) {
      const next = Number.isFinite(ms) ? Math.max(1, ms) : FRAME_INTERVAL_MS
      if (next === interval) return
      interval = next
      if (keepAliveCount > 0) reconcileTimer()
    },
    suspend(ms) {
      if (Number.isFinite(ms) && ms > 0) {
        suspendedUntil = Math.max(suspendedUntil, now() + ms)
      }
    },
  }
}

export const ClockContext = createContext<Clock | null>(null)

/** The terminal owns one clock; blur reduces wakeups for every subscriber. */
export function ClockProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  const [clock] = useState(() => createClock(FRAME_INTERVAL_MS))
  const focused = useSyncExternalStore(subscribeTerminalFocus, getTerminalFocused, getTerminalFocused)
  useEffect(() => {
    clock.setTickInterval(focused ? FRAME_INTERVAL_MS : BLURRED_INTERVAL_MS)
  }, [clock, focused])
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>
}
