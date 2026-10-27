import React, { type PropsWithChildren } from 'react'
import Box, { type Props as InkBoxProps } from '../../ink/components/Box.js'
import type { Color } from '../../ink/styles.js'
import { getTheme, type Theme } from '../../theme.js'
import { useTheme } from './ThemeProvider.js'
import { themeColor } from './theme-color.js'

type ColorField =
  | 'borderColor'
  | 'borderTopColor'
  | 'borderBottomColor'
  | 'borderLeftColor'
  | 'borderRightColor'
  | 'backgroundColor'
  | 'occlusionColor'

export type Props = Omit<InkBoxProps, ColorField> & {
  readonly borderColor?: keyof Theme | Color
  readonly borderTopColor?: keyof Theme | Color
  readonly borderBottomColor?: keyof Theme | Color
  readonly borderLeftColor?: keyof Theme | Color
  readonly borderRightColor?: keyof Theme | Color
  readonly backgroundColor?: keyof Theme | Color
  readonly occlusionColor?: keyof Theme | Color
}

export default function ThemedBox({
  borderColor, borderTopColor, borderBottomColor, borderLeftColor,
  borderRightColor, backgroundColor, occlusionColor, ...rest
}: PropsWithChildren<Props>): React.ReactNode {
  const [themeName] = useTheme()
  const palette = getTheme(themeName)

  return (
    <Box
      {...rest}
      borderColor={themeColor(borderColor, palette)}
      borderTopColor={themeColor(borderTopColor, palette)}
      borderBottomColor={themeColor(borderBottomColor, palette)}
      borderLeftColor={themeColor(borderLeftColor, palette)}
      borderRightColor={themeColor(borderRightColor, palette)}
      backgroundColor={themeColor(backgroundColor, palette)}
      occlusionColor={themeColor(occlusionColor, palette)}
    />
  )
}
