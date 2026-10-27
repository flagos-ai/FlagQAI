import React from 'react'
import Box from './Box.js'

/** Fill the free space on the nearest flex container's main axis. */
export default function Spacer(): React.JSX.Element {
  return <Box flexGrow={1} />
}
