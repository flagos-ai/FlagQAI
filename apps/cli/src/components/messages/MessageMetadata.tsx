import React from 'react'
import Text from '../design-system/ThemedText.js'

type MessageMetadataProps = {
  /** Wall-clock milliseconds of the assistant message. */
  timestamp?: number
  /** Model name shown alongside the message time. */
  model: string
}

/** A single compact row for the transcript header. Its parent controls alignment. */
export function MessageMetadata({ timestamp, model }: MessageMetadataProps): React.ReactNode {
  const pieces: string[] = []
  if (timestamp !== undefined && Number.isFinite(timestamp)) {
    const date = new Date(timestamp)
    pieces.push(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)
  }
  if (model) pieces.push(model)
  return pieces.length > 0 ? <Text dimColor>{pieces.join(' · ')}</Text> : null
}
