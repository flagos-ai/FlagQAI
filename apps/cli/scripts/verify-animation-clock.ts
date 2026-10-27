/** Run: node --import tsx/esm scripts/verify-animation-clock.ts */
import assert from 'node:assert/strict'
import React, { useContext, useLayoutEffect } from 'react'
import { createClock, ClockContext, ClockProvider } from '../src/ink/components/ClockContext.js'
import { renderToScreen } from '../src/ink/render-to-screen.js'
import { setTerminalFocused, resetTerminalFocusState } from '../src/ink/terminal-focus-state.js'
import { Text } from '../src/ui.js'

const originalPerformance = globalThis.performance
const originalNow = Object.getOwnPropertyDescriptor(originalPerformance, 'now')
const originalSetInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
let elapsed = 0
let nextTimerId = 1
const timers = new Map<number, { callback: () => void; interval: number }>()
const installedRates: number[] = []

Object.defineProperty(originalPerformance, 'now', { configurable: true, value: () => elapsed })
globalThis.setInterval = ((callback: () => void, interval: number) => {
  const id = nextTimerId++
  timers.set(id, { callback, interval })
  installedRates.push(interval)
  return id as unknown as ReturnType<typeof setInterval>
}) as typeof setInterval
globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
  timers.delete(id as unknown as number)
}) as typeof clearInterval

function advance(time: number): void {
  elapsed = time
  for (const { callback } of [...timers.values()]) callback()
}

try {
  const clock = createClock(16)
  const calls: string[] = []
  assert.equal(clock.now(), 0)
  const stopPassive = clock.subscribe(() => calls.push('passive'), false)
  advance(16)
  assert.deepEqual(calls, [], 'passive subscribers must not wake the process')
  assert.equal(timers.size, 0)

  const stopActive = clock.subscribe(() => calls.push('active'), true)
  assert.equal(timers.size, 1)
  assert.equal([...timers.values()][0]?.interval, 16)
  advance(32)
  assert.deepEqual(calls, ['passive', 'active'])
  assert.equal(clock.now(), 32)

  clock.setTickInterval(250)
  assert.equal(timers.size, 1, 'focus-rate changes replace, not add, a timer')
  assert.equal([...timers.values()][0]?.interval, 250)
  clock.setTickInterval(250)
  assert.equal(nextTimerId, 3, 'an unchanged interval does not restart the clock')
  clock.suspend(100)
  advance(90)
  assert.equal(calls.length, 2, 'suspension skips notifications')
  clock.suspend(80)
  advance(140)
  assert.equal(calls.length, 2, 'overlapping suspension extends the quiet window')
  advance(170)
  assert.deepEqual(calls, ['passive', 'active', 'passive', 'active'])

  stopActive()
  stopActive()
  assert.equal(timers.size, 0, 'unsubscribing the last keep-alive stops the timer')
  advance(200)
  assert.equal(calls.length, 4)
  const stopSecond = clock.subscribe(() => calls.push('second'), true)
  assert.equal(timers.size, 1)
  advance(216)
  assert.deepEqual(calls.slice(-2), ['passive', 'second'])
  stopSecond()
  stopPassive()
  assert.equal(timers.size, 0)
  assert.equal(clock.now(), 216)

  function Subscriber(): React.ReactElement {
    const shared = useContext(ClockContext)
    useLayoutEffect(() => shared?.subscribe(() => {}, true), [shared])
    return React.createElement(Text, null, 'clock')
  }
  setTerminalFocused(false)
  try {
    const previousRateCount = installedRates.length
    renderToScreen(React.createElement(ClockProvider, null, React.createElement(Subscriber)), 20)
    assert.ok(installedRates.slice(previousRateCount).includes(250), 'blurred terminal slows the shared animation clock')
    assert.equal(timers.size, 0, 'provider unmount leaves no timer behind')
    setTerminalFocused(true)
    const focusedRateCount = installedRates.length
    renderToScreen(React.createElement(ClockProvider, null, React.createElement(Subscriber)), 20)
    assert.ok(installedRates.slice(focusedRateCount).includes(16), 'focused terminal retains animation rate')
    assert.equal(timers.size, 0)
  } finally {
    resetTerminalFocusState()
  }
} finally {
  if (originalNow) Object.defineProperty(originalPerformance, 'now', originalNow)
  else delete (originalPerformance as Performance & { now?: () => number }).now
  globalThis.setInterval = originalSetInterval
  globalThis.clearInterval = originalClearInterval
}

console.log('animation clock verified (single timer, passive listeners, interval, suspension and cleanup)')
