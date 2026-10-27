import React, { type PropsWithChildren } from 'react'
import ThemedBox, { type Props as BoxProps } from '../../components/design-system/ThemedBox.js'

type Props = PropsWithChildren<Omit<BoxProps, 'noSelect'> & {
  readonly fromLeftEdge?: boolean
}>

/** Fence a layout region out of terminal text selection without changing its events. */
export function NoSelect({ fromLeftEdge = false, ...boxProps }: Props): React.JSX.Element {
  return <ThemedBox {...boxProps} noSelect={fromLeftEdge ? 'from-left-edge' : true} />
}
