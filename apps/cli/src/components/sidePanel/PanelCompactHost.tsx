import React from 'react'
import { Box } from '../../ui.js'
import { panelStore } from './PanelStore.js'
import { PanelErrorBoundary } from './PanelErrorBoundary.js'

/** Keep the active panel's compact view bounded when the full sidebar is hidden. */
export function PanelCompactHost({ enabledPanelIds, activePanelId, width }: {
  readonly enabledPanelIds: readonly string[]
  readonly activePanelId: string | undefined
  readonly width: number
}): React.ReactNode {
  const entries = React.useSyncExternalStore(panelStore.subscribe, () => panelStore.list())
  const enabled = enabledPanelIds.map(id => entries.find(entry => entry.definition.id === id))
    .filter(entry => entry !== undefined)
  const entry = enabled.find(item => item.definition.id === activePanelId)
  const compact = entry?.definition.compact
  if (entry === undefined || entry.disabled === true || compact === undefined || width < 1) return null
  return (
    <Box flexDirection="column" flexShrink={0} maxHeight={compact.maxRows} overflow="hidden" width={width}>
      <Box flexDirection="column" flexShrink={0}>
        <PanelErrorBoundary key={entry.registrationId} panelId={entry.definition.id}>
          {React.createElement(compact.component, { width, badge: entry.badge })}
        </PanelErrorBoundary>
      </Box>
    </Box>
  )
}
