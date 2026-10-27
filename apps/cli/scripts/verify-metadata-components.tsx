/** Run: node --import tsx/esm scripts/verify-metadata-components.tsx */
import assert from 'node:assert/strict'
import React from 'react'
import { Box } from '../src/ui.js'
import { MessageMetadata } from '../src/components/messages/MessageMetadata.js'
import { renderToScreen } from '../src/ink/render-to-screen.js'
import { cellAt } from '../src/ink/screen.js'

function row(element: React.ReactElement, width = 24): string {
  const { screen, height } = renderToScreen(element, width)
  assert.equal(height, 1, 'metadata occupies one terminal row')
  return Array.from({ length: width }, (_, column) => cellAt(screen, column, 0)?.char ?? ' ').join('')
}

const timestamp = new Date(2020, 1, 2, 3, 4).getTime()
const aligned = row(
  <Box width={24} flexDirection="row" justifyContent="flex-end">
    <MessageMetadata timestamp={timestamp} model="model-x" />
  </Box>,
)
assert.equal(aligned.trim(), '03:04 · model-x')
assert.ok(aligned.endsWith('03:04 · model-x'), 'transcript parent keeps the metadata right-aligned')
assert.equal(row(<Box><MessageMetadata model="model-x" /></Box>).trim(), 'model-x')

console.log('message metadata passed (single-row time and model, right alignment)')
