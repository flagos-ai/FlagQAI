import React from 'react'
import { Box, Text } from '../ui.js'
import { t } from '../i18n.js'

type ThinkingToggleProps = {
  currentValue: boolean
  focusIndex: number
  onPick?: (index: number) => void
}

const choices = [
  { label: 'thinking-enabled', description: 'thinking-enabled-desc', value: true },
  { label: 'thinking-disabled', description: 'thinking-disabled-desc', value: false },
] as const

/** A presentation-only choice list; the parent owns the setting and input. */
export function ThinkingToggle({ currentValue, focusIndex, onPick }: ThinkingToggleProps): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={2} paddingLeft={2}>
      <Text bold>{t('thinking-title')}</Text>
      <Text dimColor>{t('thinking-subtitle')}</Text>
      <Box flexDirection="column" marginTop={1}>
        {choices.map((choice, index) => (
          <Box key={choice.label} flexDirection="column" onClick={onPick ? () => onPick(index) : undefined}>
            <Text>{`${index === focusIndex ? '❯ ' : '  '}${t(choice.label)}${currentValue === choice.value ? ' ✓' : ''}`}</Text>
            <Text dimColor>{`  ${t(choice.description)}`}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{t('thinking-confirm-hint')}</Text>
      </Box>
    </Box>
  )
}
