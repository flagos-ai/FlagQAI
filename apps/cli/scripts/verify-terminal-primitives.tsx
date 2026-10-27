/** Run: node --import tsx/esm scripts/verify-terminal-primitives.tsx */
import assert from 'node:assert/strict'
import React, { useContext } from 'react'
import { Box, Text } from '../src/ui.js'
import { renderToScreen } from '../src/ink/render-to-screen.js'
import { cellAt } from '../src/ink/screen.js'
import Spacer from '../src/ink/components/Spacer.js'
import Newline from '../src/ink/components/Newline.js'
import TerminalFocusContext, { TerminalFocusProvider } from '../src/ink/components/TerminalFocusContext.js'
import { setTerminalFocused, resetTerminalFocusState } from '../src/ink/terminal-focus-state.js'
import { useTerminalSize } from '../src/ink/hooks/use-terminal-size.js'
import { TerminalSizeContext } from '../src/ink/components/TerminalSizeContext.js'
import { ClockContext, type Clock } from '../src/ink/components/ClockContext.js'
import { useBlink } from '../src/hooks/useBlink.js'

function rows(element: React.ReactElement, width = 20): string[] {
  const result = renderToScreen(element, width)
  return Array.from({ length: result.height }, (_, y) =>
    Array.from({ length: width }, (_, x) => cellAt(result.screen, x, y)?.char ?? ' ').join('').trimEnd())
}

assert.deepEqual(rows(<Box width={10} flexDirection="row"><Text>A</Text><Spacer /><Text>B</Text></Box>),
  ['A        B'])
assert.deepEqual(rows(<Box height={4} flexDirection="column"><Text>A</Text><Spacer /><Text>B</Text></Box>),
  ['A', '', '', 'B'])
assert.deepEqual(rows(<Text>A<Newline />B</Text>), ['A', 'B'])
assert.deepEqual(rows(<Text>A<Newline count={0} />B</Text>), ['AB'])
assert.deepEqual(rows(<Text>A<Newline count={2} />B</Text>), ['A', '', 'B'])
assert.deepEqual(rows(<Text>A<Newline count={-1} />B</Text>), ['AB'], 'negative counts are harmless')

let boxStyle: { flexDirection?: string; flexWrap?: string; flexGrow?: number; flexShrink?: number; overflowX?: string; overflowY?: string; paddingLeft?: number } | undefined
let boxAttributes: { tabIndex?: number; autoFocus?: boolean } | undefined
assert.deepEqual(rows(<Box ref={node => {
  if (node) { boxStyle = node.style; boxAttributes = node.attributes }
}} paddingLeft={1} overflow="hidden" tabIndex={2} autoFocus><Text>cell</Text></Box>), [' cell'])
assert.deepEqual(Object.fromEntries(Object.entries(boxStyle ?? {}).filter(([, value]) => value !== undefined)), {
  paddingLeft: 1, overflow: 'hidden', flexDirection: 'row', flexWrap: 'nowrap',
  flexGrow: 0, flexShrink: 1, overflowX: 'hidden', overflowY: 'hidden',
}, 'Box preserves the renderer layout defaults and overflow axes')
assert.equal(boxAttributes?.tabIndex, 2, 'Box forwards focus order to the renderer node')
assert.equal(boxAttributes?.autoFocus, true, 'Box forwards initial focus to the renderer node')

function Focus() {
  const value = useContext(TerminalFocusContext)
  return <Text>{`${value.isTerminalFocused}/${value.terminalFocusState}`}</Text>
}
resetTerminalFocusState()
try {
  assert.deepEqual(rows(<TerminalFocusProvider><Focus /></TerminalFocusProvider>), ['true/unknown'])
  setTerminalFocused(false)
  assert.deepEqual(rows(<TerminalFocusProvider><Focus /></TerminalFocusProvider>), ['false/blurred'])
  setTerminalFocused(true)
  assert.deepEqual(rows(<TerminalFocusProvider><Focus /></TerminalFocusProvider>), ['true/focused'])
} finally {
  resetTerminalFocusState()
}

function Size() {
  const size = useTerminalSize()
  return <Text>{`${size.columns}x${size.rows}/${size.screenRows}`}</Text>
}
assert.deepEqual(rows(<TerminalSizeContext.Provider value={{ columns: 11, rows: 5, screenRows: 8 }}>
  <Size />
</TerminalSizeContext.Provider>), ['11x5/8'])

function Blink({ enabled }: { enabled: boolean }) {
  const [ref, visible] = useBlink(enabled)
  return <Box ref={ref}><Text>{visible ? 'visible' : 'hidden'}</Text></Box>
}
function at(time: number, enabled = true): string[] {
  const clock: Clock = { now: () => time, subscribe: () => () => {}, setTickInterval: () => {}, suspend: () => {} }
  return rows(<TerminalFocusProvider><ClockContext.Provider value={clock}>
    <Blink enabled={enabled} />
  </ClockContext.Provider></TerminalFocusProvider>)
}
assert.deepEqual(at(0), ['visible'])
assert.deepEqual(at(600), ['hidden'])
assert.deepEqual(at(1200), ['visible'])
assert.deepEqual(at(600, false), ['visible'], 'disabled blink is steadily visible')
setTerminalFocused(false)
try {
  assert.deepEqual(at(600), ['visible'], 'blurred terminal is steadily visible')
} finally {
  resetTerminalFocusState()
}

console.log('terminal primitives verified (flex space, newlines, focus, size and blink)')
