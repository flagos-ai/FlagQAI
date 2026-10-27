/** Native presentation/timer binding for shared activity folds. */
import { createActivityProjection as createSharedActivity } from '#flagqai/ui-core/activity'
import type { ActivityState, ActivityDeps, ActivityHost } from '#flagqai/ui-core/activity'
import { t } from '../i18n.js'
import { markChannelReadDirty } from '../adapter/channel/read-view.js'
export * from '#flagqai/ui-core/activity'
export const nativeActivityHost: ActivityHost = { t, markChannelReadDirty, timer: {
  set(callback, ms) { const handle = setInterval(callback, ms); handle.unref(); return handle },
  clear(handle) { clearInterval(handle as ReturnType<typeof setInterval>) },
} }
export function createActivityProjection(getState: () => ActivityState, deps: ActivityDeps) {
  return createSharedActivity(getState, deps, nativeActivityHost)
}
export type ActivityProjection = ReturnType<typeof createActivityProjection>
