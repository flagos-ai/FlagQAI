/** Run: node --import tsx/esm scripts/verify-pane-loading.tsx */
import assert from 'node:assert/strict'
import React from 'react'

process.env.FORCE_COLOR = '3'
const [{ Box, Text }, { Pane }, { LoadingState }, { ThemeProvider }, { renderToScreen }, { cellAt }] = await Promise.all([
  import('../src/ui.js'),
  import('../src/components/design-system/Pane.js'),
  import('../src/components/design-system/LoadingState.js'),
  import('../src/components/design-system/ThemeProvider.js'),
  import('../src/ink/render-to-screen.js'),
  import('../src/ink/screen.js'),
])

function rows(element: React.ReactElement, width = 24): string[] {
  const result = renderToScreen(<ThemeProvider theme="dark">{element}</ThemeProvider>, width)
  return Array.from({ length: result.height }, (_, row) =>
    Array.from({ length: width }, (_, column) => cellAt(result.screen, column, row)?.char ?? ' ').join(''))
}

const pane = rows(<Box width={24}><Pane color="accent"><Text>Choices</Text></Pane></Box>)
assert.equal(pane.length, 3, 'pane adds one blank row and one top rule')
assert.equal(pane[0]?.trim(), '')
assert.ok(pane[1]?.includes('─'), 'pane has a horizontal top rule')
assert.ok(pane[2]?.startsWith('  Choices'), 'pane content has horizontal padding')
const accent = renderToScreen(<ThemeProvider theme="dark"><Pane color="accent"><Text>A</Text></Pane></ThemeProvider>, 24)
const warning = renderToScreen(<ThemeProvider theme="dark"><Pane color="warning"><Text>A</Text></Pane></ThemeProvider>, 24)
assert.notEqual(cellAt(accent.screen, 5, 1)?.styleId, cellAt(warning.screen, 5, 1)?.styleId,
  'the top rule follows the selected theme color')

const compact = rows(<LoadingState message="Loading models" />)
assert.equal(compact.length, 1)
assert.ok(compact[0]?.includes('Loading models'))
const explained = rows(<LoadingState message="Loading models" subtitle="Querying provider" bold />)
assert.equal(explained.length, 2, 'subtitle occupies the next row')
assert.ok(explained[1]?.includes('Querying provider'))

console.log('pane and loading state passed (rule, spacing, message and subtitle)')
