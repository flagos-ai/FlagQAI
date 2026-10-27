/** Run: node --import tsx/esm scripts/verify-stalled-spinner-hook.tsx */
import assert from 'node:assert/strict'
import React, { useLayoutEffect, useState } from 'react'
import { Text } from '../src/ui.js'
import { renderToScreen } from '../src/ink/render-to-screen.js'
import { getStallState, useStalledAnimation } from '../src/components/Spinner/useStalledAnimation.js'

for (const [time, expected] of [
  [0, 0], [3000, 0], [3500, 0.25], [4000, 0.5], [5000, 1], [6000, 1],
] as const) {
  const state = getStallState(time)
  assert.equal(state.intensity, expected)
  assert.equal(state.isStalled, expected > 0)
  assert.deepEqual(getStallState(time, true), { isStalled: false, intensity: 0 })
}
assert.deepEqual(getStallState(NaN), { isStalled: false, intensity: 0 })

type Frame = { time: number; length: number; tools?: boolean; reducedMotion?: boolean }
const frames: Frame[] = [
  { time: 0, length: 0 },
  { time: 3000, length: 0 },
  { time: 4000, length: 0 },
  { time: 5000, length: 0 },
  { time: 5100, length: 1 },
  { time: 9000, length: 1, tools: true },
  { time: 9100, length: 1 },
  { time: 12200, length: 1, reducedMotion: true },
]
const observed: Array<{ isStalled: boolean; stalledIntensity: number }> = []

function Playback() {
  const [index, setIndex] = useState(0)
  const frame = frames[index]!
  const result = useStalledAnimation(frame.time, frame.length, frame.tools, frame.reducedMotion)
  observed.push({ ...result })
  useLayoutEffect(() => {
    if (index + 1 < frames.length) setIndex(index + 1)
  }, [index])
  return <Text>{result.stalledIntensity.toFixed(2)}</Text>
}
renderToScreen(<Playback />, 20)
assert.equal(observed.length, frames.length, 'the same mounted hook receives every clock frame')
assert.deepEqual(observed.slice(0, 2).map(value => value.isStalled), [false, false])
assert.equal(observed[2]?.isStalled, true)
assert.ok(observed[2]!.stalledIntensity > 0 && observed[2]!.stalledIntensity < 1)
assert.ok(observed[3]!.stalledIntensity > observed[2]!.stalledIntensity)
assert.equal(observed[4]?.isStalled, false, 'new output resets silence')
assert.equal(observed[5]?.isStalled, false, 'active tools suppress warning')
assert.equal(observed[6]?.isStalled, false, 'tool completion starts a fresh quiet interval')
assert.equal(observed[7]?.stalledIntensity, 0.1, 'reduced motion snaps to target instead of easing')

console.log('stalled spinner hook verified (ramp, frame easing, output reset and tool activity)')
