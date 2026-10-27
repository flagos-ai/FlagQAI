import React from 'react'
import { Box, NoSelect, Text } from '../../ui.js'
import { Markdown } from '../Markdown.js'

type Props = {
  text: string
  marginTopOnTurn: boolean
  isSelected?: boolean
  /** Expansion is owned by the transcript; the same body renders in either state. */
  isExpanded?: boolean
}

/** A settled assistant response occupies one transcript row group. */
export function AssistantTextMessage({ text, marginTopOnTurn, isSelected = false }: Props): React.ReactNode {
  return (
    <Box
      width="100%"
      flexDirection="row"
      alignItems="flex-start"
      marginTop={marginTopOnTurn ? 1 : 0}
      backgroundColor={isSelected ? 'messageActionsBackground' : undefined}
    >
      <Box width={2} flexShrink={0}>
        <NoSelect><Text color="text">●</Text></NoSelect>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Markdown>{text}</Markdown>
      </Box>
    </Box>
  )
}
