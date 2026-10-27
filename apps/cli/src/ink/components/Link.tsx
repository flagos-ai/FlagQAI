import React, { type ReactNode } from 'react'
import { supportsHyperlinks } from '../supports-hyperlinks.js'
import Text from './Text.js'

export type Props = {
  readonly children?: ReactNode
  readonly url: string
  readonly fallback?: ReactNode
}

/** Retain useful label text in terminals without OSC 8 support. */
export default function Link({ children, url, fallback }: Props): React.JSX.Element {
  if (!supportsHyperlinks()) return <Text>{fallback ?? children ?? url}</Text>
  return <Text><ink-link href={url}>{children ?? url}</ink-link></Text>
}
