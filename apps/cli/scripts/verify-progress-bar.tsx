/** Run: node --import tsx/esm scripts/verify-progress-bar.tsx */
import assert from 'node:assert/strict'
import React from 'react'

process.env.FORCE_COLOR = '3'
const [{ ProgressBar }, { ThemeProvider }, { renderToScreen }, { cellAt }] = await Promise.all([
  import('../src/components/design-system/ProgressBar.js'),
  import('../src/components/design-system/ThemeProvider.js'),
  import('../src/ink/render-to-screen.js'),
  import('../src/ink/screen.js'),
])

function visibleBar(ratio: number, width: number) {
  const result = renderToScreen(
    <ThemeProvider theme="dark"><ProgressBar ratio={ratio} width={width} fillColor="accent" emptyColor="inactive" /></ThemeProvider>,
    20,
  )
  return {
    height: result.height,
    cells: Array.from({ length: width }, (_, column) => cellAt(result.screen, column, 0)),
  }
}

assert.equal(visibleBar(0, 5).cells.map(cell => cell?.char).join(''), '     ')
assert.equal(visibleBar(0.5, 5).cells.map(cell => cell?.char).join(''), '██▌  ')
assert.equal(visibleBar(0.125, 1).cells.map(cell => cell?.char).join(''), '▏')
assert.equal(visibleBar(0.875, 1).cells.map(cell => cell?.char).join(''), '▉')
assert.equal(visibleBar(1, 5).cells.map(cell => cell?.char).join(''), '█████')
assert.equal(visibleBar(-1, 5).cells.map(cell => cell?.char).join(''), '     ')
assert.equal(visibleBar(2, 5).cells.map(cell => cell?.char).join(''), '█████')
assert.equal(visibleBar(Number.NaN, 5).cells.map(cell => cell?.char).join(''), '     ')
assert.equal(visibleBar(0.5, 0).height, 0)
assert.equal(visibleBar(0.5, Number.NaN).height, 0)

const half = visibleBar(0.5, 5).cells
assert.notEqual(half[0]?.styleId, half[4]?.styleId, 'filled and empty cells retain different colors')

console.log('progress bar passed (bounds, fractional cell, fixed width and color separation)')
