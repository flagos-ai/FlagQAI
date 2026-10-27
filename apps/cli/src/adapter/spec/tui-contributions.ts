/** One adapter entry point for private TUI protocol definitions. */
import { DECISION_EVENTS } from '#tui-profile/profile-definitions'

export * from '#tui-profile/profile-definitions'
export {
  TUI_DECISION_EVENT_NAMES,
  TUI_EXTENSION_PERMISSION_NAMES,
} from './protocol-constants.js'

/** Use the canonical profile coordinate so the runtime cannot drift from it. */
export const TUI_EXTENSION_API_VERSION = DECISION_EVENTS.apiVersion
export const DECISION_EVENTS_COORDINATE = DECISION_EVENTS
