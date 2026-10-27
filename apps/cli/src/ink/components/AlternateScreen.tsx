import React from 'react'
import Box from './Box.js'
import { useTerminalSize } from '../hooks/use-terminal-size.js'
import instances from '../instances.js'
import { CURSOR_HOME } from '../termio/csi.js'
import {
  DISABLE_MOUSE_TRACKING,
  ENABLE_MOUSE_TRACKING,
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
} from '../termio/dec.js'
import { handoffAckArmed, noteScreenAdopted, ownsAltScreenExit } from '../../handoffAck.js'

type Props = {
  children?: React.ReactNode
  mouseTracking?: boolean
}

/** Keep the physical alternate buffer and the renderer's layout mode in one
 * React lifetime. A replacement process can inherit an already-open buffer;
 * handoffAck owns the decision about which process closes it. */
export function AlternateScreen({ children, mouseTracking = true }: Props): React.ReactNode {
  const { columns, rows } = useTerminalSize()
  React.useEffect(() => {
    const renderer = instances.get(process.stdout) ?? (instances.size === 1 ? instances.values().next().value : undefined)
    const output = renderer?.outputStream ?? process.stdout
    const inherited = handoffAckArmed()

    if (!inherited) output.write(ENTER_ALT_SCREEN + CURSOR_HOME)
    renderer?.setAltScreenActive(true, mouseTracking)
    if (mouseTracking && !inherited) output.write(ENABLE_MOUSE_TRACKING)
    if (inherited) noteScreenAdopted()

    return () => {
      // Settle the renderer's pointer state and terminal images while its
      // buffer still exists. A failed handoff never closes the old owner's
      // screen; a ready replacement is responsible for its own exit.
      renderer?.setAltScreenActive(false)
      if (!inherited || ownsAltScreenExit()) {
        output.write(EXIT_ALT_SCREEN)
        if (mouseTracking) output.write(DISABLE_MOUSE_TRACKING)
      }
    }
  }, [mouseTracking])

  return <Box width={columns} height={rows} flexDirection="column">{children}</Box>
}
