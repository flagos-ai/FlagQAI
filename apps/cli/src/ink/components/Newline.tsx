import React from 'react'
import Text from './Text.js'

export type Props = { readonly count?: number }

/** Add explicit line breaks inside a text parent. */
export default function Newline({ count = 1 }: Props): React.JSX.Element {
  const lines = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
  return <Text>{'\n'.repeat(lines)}</Text>
}
