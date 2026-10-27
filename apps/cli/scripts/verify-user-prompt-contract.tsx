/** Run: node --import tsx/esm scripts/verify-user-prompt-contract.tsx */
import assert from 'node:assert/strict'
import React from 'react'

process.env.FORCE_COLOR = '3'
const [
  { UserPromptMessage },
  { ThemeProvider },
  { default: Text },
  { renderToScreen },
  { cellAt },
  { TerminalSizeContext },
] = await Promise.all([
  import('../src/components/messages/UserPromptMessage.js'),
  import('../src/components/design-system/ThemeProvider.js'),
  import('../src/components/design-system/ThemedText.js'),
  import('../src/ink/render-to-screen.js'),
  import('../src/ink/screen.js'),
  import('../src/ink/components/TerminalSizeContext.js'),
])

function paint(element: React.ReactElement, width = 24) {
  const result = renderToScreen(
    <TerminalSizeContext.Provider value={{ columns: width, rows: 24, screenRows: 24 }}>
      <ThemeProvider theme="dark">{element}</ThemeProvider>
    </TerminalSizeContext.Provider>,
    width,
  )
  const lines = Array.from({ length: result.height }, (_, row) =>
    Array.from({ length: width }, (_, column) => cellAt(result.screen, column, row)?.char ?? ' ').join('').trimEnd())
  return { ...result, lines }
}

const ordinary = paint(<UserPromptMessage text={'First line\nSecond line'} marginTopOnTurn={false} />)
assert.deepEqual(ordinary.lines, ['❯ First line', '  Second line'], 'user text keeps its continuation aligned after the marker')
const spaced = paint(<UserPromptMessage text="New turn" marginTopOnTurn />)
assert.deepEqual(spaced.lines, ['', '❯ New turn'], 'turn spacing inserts one blank row')
const narrow = paint(<UserPromptMessage text="ABCDEFGHIJK" marginTopOnTurn={false} />, 8)
assert.equal(narrow.lines[0], '❯ ABCDEF', 'a narrow terminal keeps the prompt marker and visible text')
assert.ok(narrow.lines.some(line => line.includes('GHIJK')), 'wrapped text remains available after the first row')
const wide = paint(<UserPromptMessage text="中文量子" marginTopOnTurn={false} />, 6)
assert.deepEqual(wide.lines, ['❯ 中文', '  量子'], 'wide glyphs wrap by terminal cells without dropping the tail')
assert.deepEqual(paint(<UserPromptMessage text="" marginTopOnTurn={false} />).lines, ['❯'],
  'an empty prompt still keeps its recognizable marker')

const gold = paint(<Text color="userPromptLabel" bold>G</Text>)
assert.equal(cellAt(ordinary.screen, 2, 0)?.styleId, cellAt(gold.screen, 0, 0)?.styleId,
  'the prompt body uses the semantic gold bold style')
const selected = paint(<UserPromptMessage text="Selected" marginTopOnTurn={false} isSelected />)
const unselected = paint(<UserPromptMessage text="Selected" marginTopOnTurn={false} />)
assert.deepEqual(selected.lines, unselected.lines, 'selection changes styling without changing the message')
assert.notEqual(cellAt(selected.screen, 4, 0)?.styleId, cellAt(unselected.screen, 4, 0)?.styleId,
  'selection paints a distinct highlight')

console.log('user prompt contract passed (marker, multiline, narrow wrap, spacing, semantic color, selection)')
