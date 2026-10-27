/**
 * Interaction-time telemetry stubs used by the renderer's input and scroll
 * paths. flagqai does not track interaction time, so these hooks are no-ops.
 */
/** No-op interaction-time flush stub; flagqai does not track interaction time. */
export function flushInteractionTime(): void {}

/** No-op interaction-time update stub; flagqai does not track interaction time. */
export function updateLastInteractionTime(): void {}

/** No-op scroll-activity stub; flagqai does not track interaction time. */
export function markScrollActivity(): void {}
