import React from 'react'
import { Box, Text } from '../ui.js'
import { renderCellRows, STANDARD_FRAME_INDEX, WhaleArt } from './Whale.js'
import type { TerminalImageSource } from '../ink/terminal-image.js'

/** The legacy portrait setting keeps its slot, but the release has no bundled portrait. */
const USER_PORTRAIT_COLUMNS = 30

/**
 * An optional user portrait is handled by the image-protocol path in the
 * parent. Without one, retain the art slot using the licensed pixel whale.
 */
export function WhaleGirlArt({ width }: { width?: number }): React.ReactNode {
  return <WhaleArt frameIndex={STANDARD_FRAME_INDEX} width={width} />
}

/** Preserve user-provided images; use the licensed whale when no image exists. */
export function WhaleGirlHappyArt({ source, width = 40 }: {
  source?: TerminalImageSource
  width?: number
}): React.ReactNode {
  if (source === undefined) {
    return <WhaleArt frameIndex={STANDARD_FRAME_INDEX} width={width} />
  }
  return <UserPortraitCells source={source} width={width} />
}

function UserPortraitCells({ source, width }: { source: TerminalImageSource, width: number }): React.ReactNode {
  const rows = React.useMemo(() => {
    return renderCellRows(USER_PORTRAIT_COLUMNS, 32, (x, y) => {
      const sx = Math.min(source.width - 1, Math.floor((x + 0.5) * source.width / USER_PORTRAIT_COLUMNS))
      const sy = Math.min(source.height - 1, Math.floor((y + 0.5) * source.height / 32))
      const at = (sy * source.width + sx) * 4
      if ((source.data[at + 3] ?? 0) < 80) return undefined
      return [source.data[at] ?? 0, source.data[at + 1] ?? 0, source.data[at + 2] ?? 0] as const
    })
  }, [source])
  const pad = Math.max(0, Math.floor((width - USER_PORTRAIT_COLUMNS) / 2))
  return (
    <Box flexDirection="column" flexShrink={0} width={width}>
      {rows.map((row, index) => (
        <Text key={index} wrap="truncate-end">{' '.repeat(pad)}{row}</Text>
      ))}
    </Box>
  )
}
