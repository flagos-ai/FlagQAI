import React, { createContext, useSyncExternalStore, type PropsWithChildren } from 'react'
import { getTerminalFocusState, subscribeTerminalFocus, type TerminalFocusState } from '../terminal-focus-state.js'

export type { TerminalFocusState }
export type TerminalFocusContextProps = {
  readonly isTerminalFocused: boolean
  readonly terminalFocusState: TerminalFocusState
}

const TerminalFocusContext = createContext<TerminalFocusContextProps>({
  isTerminalFocused: true,
  terminalFocusState: 'unknown',
})

/** Publish the terminal's synchronous focus snapshot to React consumers. */
export function TerminalFocusProvider({ children }: PropsWithChildren): React.JSX.Element {
  const state = useSyncExternalStore(subscribeTerminalFocus, getTerminalFocusState)
  return <TerminalFocusContext.Provider value={{
    isTerminalFocused: state !== 'blurred',
    terminalFocusState: state,
  }}>{children}</TerminalFocusContext.Provider>
}

export default TerminalFocusContext
