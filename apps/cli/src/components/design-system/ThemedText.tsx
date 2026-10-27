import React from 'react'
import Text from '../../ink/components/Text.js'
import type { DOMElement } from '../../ink/dom.js'
import type { Color, Styles } from '../../ink/styles.js'
import { getTheme, type Theme } from '../../theme.js'
import { useTheme } from './ThemeProvider.js'
import { themeColor } from './theme-color.js'

export const TextHoverColorContext = React.createContext<keyof Theme | undefined>(undefined)

export type Props = {
  readonly color?: keyof Theme | Color
  readonly backgroundColor?: keyof Theme | Color
  /** Use the palette's inactive color without ANSI dim, so bold still works. */
  readonly dimColor?: boolean
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly inverse?: boolean
  readonly wrap?: Styles['textWrap']
  readonly ref?: React.Ref<DOMElement>
  readonly decoration?: Styles['decoration']
  readonly children?: React.ReactNode
}

export default function ThemedText({
  color, backgroundColor, dimColor, bold, italic, underline,
  strikethrough, inverse, wrap, ref, decoration, children,
}: Props): React.ReactNode {
  const [themeName] = useTheme()
  const palette = getTheme(themeName)
  const hoverColor = React.useContext(TextHoverColorContext)
  const foreground = dimColor ? 'inactive' : color ?? hoverColor

  return (
    <Text
      color={themeColor(foreground, palette)}
      backgroundColor={themeColor(backgroundColor, palette)}
      bold={bold ?? false}
      italic={italic}
      underline={underline}
      strikethrough={strikethrough}
      inverse={inverse}
      wrap={wrap}
      ref={ref}
      decoration={decoration}
    >
      {children}
    </Text>
  )
}
