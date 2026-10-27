/** Run: node --import tsx/esm scripts/verify-list-item-contract.tsx */
import assert from 'node:assert/strict'
import React from 'react'
import { ListItem } from '../src/components/design-system/ListItem.js'
import { ThemeProvider } from '../src/components/design-system/ThemeProvider.js'
import Text from '../src/components/design-system/ThemedText.js'
import { renderToScreen } from '../src/ink/render-to-screen.js'
import { cellAt } from '../src/ink/screen.js'

function painted(element: React.ReactElement) {
  const result = renderToScreen(<ThemeProvider theme="dark">{element}</ThemeProvider>, 30)
  return {
    lines: Array.from({ length: result.height }, (_, y) =>
      Array.from({ length: 30 }, (_, x) => cellAt(result.screen, x, y)?.char ?? ' ').join('').trimEnd()),
    style: cellAt(result.screen, 2, 0)?.styleId,
  }
}

assert.deepEqual(painted(<ListItem isFocused>Focus</ListItem>).lines, ['❯ Focus'])
assert.deepEqual(painted(<ListItem isFocused={false} isSelected>Selected</ListItem>).lines, ['  Selected ✓'])
assert.deepEqual(painted(<ListItem isFocused={false} description={'More\ninfo'}>Plain</ListItem>).lines,
  ['  Plain', '  More info'])
assert.deepEqual(painted(<ListItem isFocused disabled isSelected>Disabled</ListItem>).lines, ['  Disabled'])
assert.deepEqual(painted(<ListItem isFocused={false} showScrollDown>Down</ListItem>).lines, ['↓ Down'])
assert.deepEqual(painted(<ListItem isFocused={false} showScrollUp>Up</ListItem>).lines, ['↑ Up'])
assert.deepEqual(painted(<ListItem isFocused styled={false}>Unstyled</ListItem>).lines, ['❯ Unstyled'],
  'custom-styled picker rows remain visible and keep their focus indicator')
assert.deepEqual(painted(<ListItem isFocused><>{'Frag\nment'} <Text>child</Text></></ListItem>).lines,
  ['❯ Frag ment child'], 'nested content stays on one selectable row')
console.log('list item contract passed (markers, description, custom styling and single-line layout)')
