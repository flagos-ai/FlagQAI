import { useContext } from 'react'
import { TerminalSizeContext, type TerminalSize } from '../components/TerminalSizeContext.js'

/** The closest layout boundary supplies dimensions, including narrowed panes. */
export function useTerminalSize(): TerminalSize {
  const size = useContext(TerminalSizeContext)
  if (size === null) throw new Error('TerminalSizeContext is required')
  return size
}
