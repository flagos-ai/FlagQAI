import React from 'react'
import { Text } from '../../ui.js'
import { getTheme, type Theme } from '../../theme.js'
import type { SpinnerMode } from './spinnerMode.js'
import { useTheme } from '../design-system/ThemeProvider.js'
import { interpolateColor, parseRGB, toRGBColor, type RGBColor } from './spinnerUtils.js'

type Props = {
  message: string
  mode: SpinnerMode
  messageColor: keyof Theme
  glimmerIndex: number
  flashOpacity: number
  shimmerColor: keyof Theme
  stalledIntensity?: number
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const clamp = (value: number): number => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

/** A themed status label with a moving highlight over whole grapheme clusters. */
export function GlimmerMessage({ message, mode, messageColor, glimmerIndex, flashOpacity, shimmerColor, stalledIntensity = 0 }: Props): React.ReactNode {
  const [themeName] = useTheme()
  const theme = getTheme(themeName)
  const base = parseRGB(theme[messageColor])
  const highlight = parseRGB(theme[shimmerColor])

  function blend(target: RGBColor | null, amount: number): `rgb(${number},${number},${number})` | keyof Theme {
    return base !== null && target !== null
      ? toRGBColor(interpolateColor(base, target, clamp(amount)))
      : messageColor
  }

  const stalled = clamp(stalledIntensity)
  if (stalled > 0) {
    return <Text color={blend(parseRGB(theme.error), stalled)}>{message} </Text>
  }
  if (mode === 'tool-use') {
    return <Text color={blend(highlight, flashOpacity)}>{message} </Text>
  }
  if (base === null || highlight === null) {
    return <Text color={messageColor}>{message} </Text>
  }

  const graphemes = Array.from(segmenter.segment(message), item => item.segment)
  return <>
    {graphemes.map((grapheme, index) => {
      const wave = Math.max(0, 1 - Math.abs(index - glimmerIndex) / 3)
      const amount = clamp(wave * 0.85 + clamp(flashOpacity) * 0.15)
      return <Text key={index} color={blend(highlight, amount)}>{grapheme}</Text>
    })}
    <Text color={messageColor}> </Text>
  </>
}
