import React from 'react'
import type { DOMElement } from '../../ink/dom.js'
import measureElement from '../../ink/measure-element.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { useTerminalSize } from '../../ink/hooks/use-terminal-size.js'
import sliceAnsi from '../../utils/sliceAnsi.js'
import { usePageInset } from '../PageMargin.js'
import type { Theme } from '../../theme.js'
import Box from './ThemedBox.js'
import Text from './ThemedText.js'

type DividerProps = {
  width?: number
  color?: keyof Theme
  char?: string
  padding?: number
  title?: string
  bleed?: boolean
}

function rule(columns: number, glyph: string, title?: string): string {
  if (columns <= 0) return ''
  const fill = glyph.length > 0 && stringWidth(glyph) === 1 ? glyph : '─'
  if (!title) return fill.repeat(columns)
  const clipped = sliceAnsi(title, 0, columns)
  const free = Math.max(0, columns - stringWidth(clipped))
  const left = Math.floor(free / 2)
  return fill.repeat(left) + clipped + fill.repeat(free - left)
}

/** A one-row rule measured against its actual container, including resize. */
export function Divider({ width, color, char = '─', padding = 0, title, bleed = false }: DividerProps): React.ReactNode {
  const { columns } = useTerminalSize()
  const inset = usePageInset()
  const bleedBy = bleed ? inset.x : 0
  const box = React.useRef<DOMElement | null>(null)
  const [measured, setMeasured] = React.useState(columns + 2 * bleedBy)

  React.useLayoutEffect(() => {
    if (width !== undefined || box.current === null) return
    const next = Math.floor(measureElement(box.current).width)
    if (next > 0 && next !== measured) setMeasured(next)
  })

  const available = width ?? measured
  const count = Math.max(0, Math.floor(available - Math.max(0, padding)))
  return (
    <Box
      ref={box}
      width={width ?? (bleedBy > 0 ? columns + 2 * bleedBy : '100%')}
      marginLeft={bleedBy === 0 ? undefined : -bleedBy}
      flexShrink={bleedBy > 0 ? 0 : 1}
    >
      <Text color={color} dimColor={color === undefined} wrap="truncate-end">{rule(count, char, title)}</Text>
    </Box>
  )
}
