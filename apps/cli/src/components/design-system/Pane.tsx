import React from 'react'
import type { Theme } from '../../theme.js'
import ThemedBox from './ThemedBox.js'

/** A prompt-adjacent region with a themed top rule and padded content. */
export function Pane({ children, color = 'permission' }: { children: React.ReactNode; color?: keyof Theme }): React.ReactNode {
  return (
    <ThemedBox
      width="100%"
      flexDirection="column"
      marginTop={1}
      paddingX={2}
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={color}
    >
      {children}
    </ThemedBox>
  )
}
