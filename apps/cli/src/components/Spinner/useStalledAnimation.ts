import { useRef } from 'react'

export type StallState = { isStalled: boolean; intensity: number }

const SILENCE_BEFORE_WARNING_MS = 3000
const WARNING_RAMP_MS = 2000
const COLOR_RESPONSE_MS = 350

/** A warning appears only after three seconds without output. */
export function getStallState(timeSinceOutput: number, hasActiveTools = false): StallState {
  if (hasActiveTools || (!Number.isFinite(timeSinceOutput) && timeSinceOutput !== Infinity)) {
    return { isStalled: false, intensity: 0 }
  }
  const fraction = Math.min(1, Math.max(0, (timeSinceOutput - SILENCE_BEFORE_WARNING_MS) / WARNING_RAMP_MS))
  return { isStalled: fraction > 0, intensity: fraction }
}

type AnimationState = {
  lastTime: number
  lastOutputTime: number
  responseLength: number
  displayedIntensity: number
}

/**
 * Follow the parent animation clock, so painting does not start a second timer.
 * New output and running tools clear the warning; delayed frames use elapsed
 * time for color easing instead of assuming a fixed frame rate.
 */
export function useStalledAnimation(
  time: number,
  currentResponseLength: number,
  hasActiveTools = false,
  reducedMotion = false,
): { isStalled: boolean; stalledIntensity: number } {
  const clockTime = Number.isFinite(time) ? Math.max(0, time) : 0
  const state = useRef<AnimationState>({
    lastTime: clockTime,
    lastOutputTime: clockTime,
    responseLength: currentResponseLength,
    displayedIntensity: 0,
  })
  const previous = state.current
  const elapsed = Math.max(0, clockTime - previous.lastTime)
  if (clockTime < previous.lastTime || currentResponseLength !== previous.responseLength || hasActiveTools) {
    previous.lastOutputTime = clockTime
  }
  previous.lastTime = clockTime
  previous.responseLength = currentResponseLength

  const target = getStallState(clockTime - previous.lastOutputTime, hasActiveTools)
  const response = reducedMotion ? 1 : 1 - Math.exp(-elapsed / COLOR_RESPONSE_MS)
  previous.displayedIntensity += (target.intensity - previous.displayedIntensity) * response
  if (Math.abs(previous.displayedIntensity - target.intensity) < 0.001) {
    previous.displayedIntensity = target.intensity
  }
  return { isStalled: target.isStalled, stalledIntensity: previous.displayedIntensity }
}
