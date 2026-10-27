import React from 'react'
import { Box, Text, useTerminalSize } from '../../ui.js'
import type { ClickEvent } from '../../ink/events/click-event.js'
import { wrapWidth } from '../../sessions/format.js'

type Props = {
  text: string
  marginTopOnTurn: boolean
  isSelected?: boolean
  onClick?(event: ClickEvent): void
}

/** Render a user turn with a fixed prompt gutter and display-width wrapping. */
export function UserPromptMessage({
  text,
  marginTopOnTurn,
  isSelected = false,
  onClick,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  const available = Math.max(1, columns - 2)
  const lines = wrapWidth(text, available)

  return (
    <Box
      width="100%"
      flexDirection="column"
      marginTop={marginTopOnTurn ? 1 : 0}
      backgroundColor={isSelected ? 'messageActionsBackground' : undefined}
      onClick={onClick}
    >
      {(lines.length > 0 ? lines : ['']).map((line, index) => (
        <Text key={index} color="userPromptLabel" bold>
          {index === 0 ? '❯ ' : '  '}{line}
        </Text>
      ))}
    </Box>
  )
}
