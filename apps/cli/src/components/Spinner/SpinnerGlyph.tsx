import React from 'react'
import { Box, Text } from '../../ui.js'
import { getTheme, type Theme } from '../../theme.js'
import { useTheme } from '../design-system/ThemeProvider.js'
import { getDefaultCharacters, interpolateColor, parseRGB, toRGBColor } from './spinnerUtils.js'

type Props = {
  frame: number
  messageColor: keyof Theme
  stalledIntensity?: number
  reducedMotion?: boolean
  time?: number
}

const frames = getDefaultCharacters()

/** A one-cell breathing dot in a stable two-column slot. */
export function SpinnerGlyph({ frame, messageColor, stalledIntensity = 0, reducedMotion = false, time }: Props): React.ReactNode {
  const [themeName] = useTheme()
  const theme = getTheme(themeName)
  const index = Number.isFinite(frame) ? ((Math.trunc(frame) % frames.length) + frames.length) % frames.length : 0
  const glyph = reducedMotion ? '●' : frames[index]
  const strength = Number.isFinite(stalledIntensity) ? Math.min(1, Math.max(0, stalledIntensity)) : 0
  const from = parseRGB(theme[messageColor])
  const warning = parseRGB(theme.error)
  const pulse = reducedMotion || time === undefined ? 1 : 0.9 + 0.1 * Math.sin(time / 300)
  const color = strength > 0 && from !== null && warning !== null
    ? toRGBColor(interpolateColor(from, warning, strength * pulse))
    : messageColor

  return <Box width={2} flexShrink={0}><Text color={color}>{glyph}</Text></Box>
}
