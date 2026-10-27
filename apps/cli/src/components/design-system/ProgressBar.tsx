import React from 'react'
import ThemedText from './ThemedText.js'
import type { Theme } from '../../theme.js'

type ProgressBarProps = {
  /** Fraction complete, from zero to one. */
  ratio: number
  /** Number of terminal columns occupied by the bar. */
  width: number
  fillColor?: keyof Theme
  emptyColor?: keyof Theme
}

const eighthCell = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const

export function ProgressBar({ ratio, width, fillColor, emptyColor }: ProgressBarProps): React.ReactNode {
  const columns = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0
  if (columns === 0) return null

  const fraction = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
  const eighths = Math.round(fraction * columns * 8)
  const filledColumns = Math.floor(eighths / 8)
  const partialEighths = eighths % 8
  const partialColumn = partialEighths > 0 ? 1 : 0
  const remainingColumns = columns - filledColumns - partialColumn
  const filledText = '█'.repeat(filledColumns) + (partialColumn > 0 ? eighthCell[partialEighths] : '')

  return <>
    {filledText && <ThemedText color={fillColor}>{filledText}</ThemedText>}
    {remainingColumns > 0 && <ThemedText color={emptyColor}>{' '.repeat(remainingColumns)}</ThemedText>}
  </>
}
