import React from 'react'
import { Box } from '../../ui.js'
import { useAnimationFrame } from '../../ink/hooks/use-animation-frame.js'
import { SpinnerGlyph } from '../Spinner/SpinnerGlyph.js'
import { getDefaultCharacters } from '../Spinner/spinnerUtils.js'
import Text from './ThemedText.js'

const frameDurationMs = 80

/** A compact animated status with an optional explanation on the next row. */
export function LoadingState({
  message,
  bold = false,
  dimColor = false,
  subtitle,
}: {
  message: string
  bold?: boolean
  dimColor?: boolean
  subtitle?: string
}): React.ReactNode {
  const [ref, time] = useAnimationFrame(frameDurationMs)
  const frameCount = Math.max(1, getDefaultCharacters().length)
  const frame = Math.floor(time / frameDurationMs) % frameCount
  return (
    <Box ref={ref} flexDirection="column">
      <Box flexDirection="row">
        <SpinnerGlyph frame={frame} messageColor="text" time={time} />
        <Text bold={bold} dimColor={dimColor}>{` ${message}`}</Text>
      </Box>
      {subtitle && <Text dimColor>{subtitle}</Text>}
    </Box>
  )
}
