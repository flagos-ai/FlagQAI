/** Run: node --import tsx/esm scripts/verify-no-select-contract.tsx */
import assert from 'node:assert/strict'
import React from 'react'
import Box from '../src/ink/components/Box.js'
import Text from '../src/ink/components/Text.js'
import { NoSelect } from '../src/ink/components/NoSelect.js'
import { renderToScreen } from '../src/ink/render-to-screen.js'

function excluded(fromLeftEdge = false) {
  const { screen } = renderToScreen(
    <Box flexDirection="row"><Text>abc</Text><NoSelect fromLeftEdge={fromLeftEdge}><Text>XY</Text></NoSelect><Text>zz</Text></Box>, 12)
  return Array.from(screen.noSelect.slice(0, 7))
}

assert.deepEqual(excluded(), [0, 0, 0, 1, 1, 0, 0],
  'a selection fence excludes only its own rendered cells')
assert.deepEqual(excluded(true), [1, 1, 1, 1, 1, 0, 0],
  'left-edge selection fences also cover the gutter before the box')
console.log('selection-fence contract passed (box-only and from-left-edge)')
