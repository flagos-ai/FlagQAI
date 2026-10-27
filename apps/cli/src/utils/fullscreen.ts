import { isEnvTruthy } from './envUtils.js'

/**
 * Whether mouse click handling is disabled. flagqai reads its own environment
 * flag (`FLAGQAI_DISABLE_MOUSE`) for this decision.
 * @returns True when FLAGQAI_DISABLE_MOUSE is set to a truthy value.
 */
export function isMouseClicksDisabled(): boolean {
  return isEnvTruthy(process.env.FLAGQAI_DISABLE_MOUSE)
}
