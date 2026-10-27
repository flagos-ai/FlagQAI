/** Run: node --import tsx/esm scripts/verify-command-suggestions-panel.tsx */
import assert from 'node:assert/strict'
import React from 'react'
import { renderToScreen } from '../src/ink/render-to-screen.js'
import { cellAt } from '../src/ink/screen.js'
import { ThemeProvider } from '../src/components/design-system/ThemeProvider.js'
import { CommandSuggestions } from '../src/components/CommandSuggestions.js'
import { splitQueryMatch } from '../src/components/SuggestionCard.js'
import { setLang } from '../src/i18n.js'

function paint(props: React.ComponentProps<typeof CommandSuggestions>, width = props.columns) {
  const result = renderToScreen(<ThemeProvider theme="dark"><CommandSuggestions {...props} /></ThemeProvider>, width)
  const lines = Array.from({ length: result.height }, (_, y) =>
    Array.from({ length: width }, (_, x) => cellAt(result.screen, x, y)?.char ?? ' ').join(''))
  return { result, lines }
}

setLang('en')
try {
  const commands = Array.from({ length: 10 }, (_, index) => ({
    name: `item${index}`, description: `Description ${index}`,
  }))
  const window = paint({ commands, selectedIndex: 8, columns: 52 })
  assert.equal(window.lines.filter(line => line.includes('│')).length, 6,
    'five command rows and one scroll footer occupy the card')
  for (const index of [5, 6, 7, 8, 9]) {
    assert.ok(window.lines.some(line => line.includes(`item${index}`)), `item${index} remains in the selected window`)
  }
  assert.ok(window.lines.some(line => line.includes('↑5')), 'footer reports hidden rows above')
  assert.ok(window.lines.some(line => line.includes('❯ item8')), 'selection is preserved while the window scrolls')
  assert.ok(!window.lines.some(line => line.includes('item4')))

  const filtered = paint({ commands: [
    { name: 'new', description: 'Start a session' },
    { name: 'compact', description: 'Compress history' },
  ], selectedIndex: 0, columns: 52, query: '/co' })
  const matchRow = filtered.lines.findIndex(line => line.includes('compact'))
  assert.ok(matchRow >= 0)
  assert.deepEqual(splitQueryMatch('compact', 'co'), { before: '', match: 'co', after: 'mpact' })

  const held = paint({ commands: [
    { name: 'new', description: 'Start a session' },
    { name: 'compact', description: 'Compress history' },
  ], selectedIndex: 0, columns: 52, query: '/co', holdFrom: 1 })
  const heldRow = held.lines.findIndex(line => line.includes('compact'))
  assert.ok(heldRow >= 0, 'a held command remains available in the menu')
  const selectedHeld = paint({ commands: [
    { name: 'new', description: 'Start a session' },
    { name: 'compact', description: 'Compress history' },
  ], selectedIndex: 1, columns: 52, holdFrom: 1 })
  assert.ok(selectedHeld.lines.some(line => line.includes('❯ compact')),
    'selection remains visible when focused on a held command')

  const narrow = paint({ commands: [{ name: 'long-command-name', description: '中文说明很长很长' }],
    selectedIndex: 0, columns: 30 })
  assert.ok(narrow.lines.some(line => line.includes('…')), 'long descriptions truncate with an ellipsis')
  assert.ok(narrow.lines.every(line => line.length <= 30), 'card never exceeds the terminal width')
} finally {
  setLang('zh')
}

console.log('command suggestions verified (scroll window, selection, query, hold and truncation)')
