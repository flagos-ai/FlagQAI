import React, { useMemo, type ReactNode, type Ref } from 'react'
import type { DOMElement } from '../dom.js'
import type { Color, Styles, TextStyles } from '../styles.js'

type BaseProps = {
  readonly children?: ReactNode
  readonly ref?: Ref<DOMElement>
  readonly color?: Color
  readonly backgroundColor?: Color
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly inverse?: boolean
  readonly wrap?: Styles['textWrap']
  readonly decoration?: Styles['decoration']
}

type WeightProps =
  | { readonly bold?: never; readonly dim?: never }
  | { readonly bold: boolean; readonly dim?: never }
  | { readonly dim: boolean; readonly bold?: never }

export type Props = BaseProps & WeightProps

/** A terminal text leaf with renderer-owned wrapping and styling. */
function Text({
  children, ref, wrap = 'wrap', decoration, color, backgroundColor,
  bold, dim, italic, underline, strikethrough, inverse,
}: Props): React.JSX.Element | null {
  const style = useMemo<Styles>(() => ({
    flexDirection: 'row', flexGrow: 0, flexShrink: 1,
    textWrap: wrap, decoration,
  }), [wrap, decoration])
  const textStyles = useMemo<TextStyles>(() => ({
    ...(color !== undefined && { color }),
    ...(backgroundColor !== undefined && { backgroundColor }),
    ...(bold !== undefined && { bold }),
    ...(dim !== undefined && { dim }),
    ...(italic !== undefined && { italic }),
    ...(underline !== undefined && { underline }),
    ...(strikethrough !== undefined && { strikethrough }),
    ...(inverse !== undefined && { inverse }),
  }), [color, backgroundColor, bold, dim, italic, underline, strikethrough, inverse])

  // A decoration can paint its own header even when there is no body text.
  if (decoration === undefined && (children === '' || React.Children.toArray(children).length === 0)) return null
  return <ink-text ref={ref} style={style} textStyles={textStyles}>{children}</ink-text>
}

export default React.memo(Text)
