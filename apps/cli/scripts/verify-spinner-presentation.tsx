/** Run: node --import tsx/esm scripts/verify-spinner-presentation.tsx */
import assert from 'node:assert/strict'
import React from 'react'

process.env.FORCE_COLOR = '3'
const [{ SpinnerGlyph }, { GlimmerMessage }, { ThemeProvider }, { renderToScreen }, { cellAt }, { Box }] = await Promise.all([
  import('../src/components/Spinner/SpinnerGlyph.js'),
  import('../src/components/Spinner/GlimmerMessage.js'),
  import('../src/components/design-system/ThemeProvider.js'),
  import('../src/ink/render-to-screen.js'),
  import('../src/ink/screen.js'),
  import('../src/ui.js'),
])

function paint(element: React.ReactElement, width = 24) {
  return renderToScreen(<ThemeProvider theme="dark"><Box flexDirection="row">{element}</Box></ThemeProvider>, width)
}
function char(result: ReturnType<typeof paint>, x: number): string {
  return cellAt(result.screen, x, 0)?.char ?? ' '
}
function style(result: ReturnType<typeof paint>, x: number): number | undefined {
  return cellAt(result.screen, x, 0)?.styleId
}

const frames = ['·', '•', '●', '•']
for (const [index, expected] of frames.entries()) {
  const result = paint(<SpinnerGlyph frame={index} messageColor="text" />)
  assert.equal(result.height, 1)
  assert.equal(char(result, 0), expected)
  assert.equal(char(result, 1), ' ', 'spinner keeps a stable two-cell slot')
}
assert.equal(char(paint(<SpinnerGlyph frame={1} messageColor="text" reducedMotion />), 0), '●')
assert.equal(char(paint(<SpinnerGlyph frame={6} messageColor="text" />), 0), '●', 'frames wrap')
assert.notEqual(style(paint(<SpinnerGlyph frame={0} messageColor="text" />), 0),
  style(paint(<SpinnerGlyph frame={0} messageColor="text" stalledIntensity={1} />), 0),
  'stall changes the status color')

const props = { message: 'AB中文CD', mode: 'thinking' as const, messageColor: 'text' as const,
  glimmerIndex: 3, flashOpacity: 0, shimmerColor: 'accent' as const }
const animated = paint(<GlimmerMessage {...props} />)
assert.equal(animated.height, 1)
assert.deepEqual([0, 1, 2, 4, 6, 7].map(x => char(animated, x)), ['A', 'B', '中', '文', 'C', 'D'])
assert.equal(char(animated, 8), ' ', 'status message retains one trailing cell')
assert.ok(new Set([0, 1, 2, 4, 6, 7].map(x => style(animated, x))).size > 1,
  'highlight moves across grapheme clusters')

const toolUse = paint(<GlimmerMessage {...props} mode="tool-use" />)
assert.equal(toolUse.height, 1)
assert.equal(style(toolUse, 0), style(toolUse, 7), 'tool-use keeps one status color')
const stalled = paint(<GlimmerMessage {...props} stalledIntensity={1} />)
assert.equal(stalled.height, 1)
assert.equal(style(stalled, 0), style(stalled, 7), 'stalled status is uniform')
assert.notEqual(style(stalled, 0), style(toolUse, 0))

console.log('spinner presentation verified (frames, slot, motion, stall and grapheme color)')
