/** Render the public settled-assistant row contract without a model runtime. */
import assert from 'node:assert/strict'
import React from 'react'

process.env.FORCE_COLOR = '3'
const [
  { AssistantTextMessage },
  { ThemeProvider },
  { renderToScreen },
  { cellAt },
  { TerminalSizeContext },
] = await Promise.all([
  import('../src/components/messages/AssistantTextMessage.js'),
  import('../src/components/design-system/ThemeProvider.js'),
  import('../src/ink/render-to-screen.js'),
  import('../src/ink/screen.js'),
  import('../src/ink/components/TerminalSizeContext.js'),
])

function paint(element: React.ReactElement, width = 30) {
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

const ordinary = paint(<AssistantTextMessage text="**Answer**" marginTopOnTurn={false} />)
assert.equal(ordinary.lines[0], '● Answer', 'the assistant marker precedes rendered Markdown')
const spaced = paint(<AssistantTextMessage text="Next turn" marginTopOnTurn />)
assert.deepEqual(spaced.lines.slice(0, 2), ['', '● Next turn'], 'turn spacing adds exactly one blank row')
const long = paint(<AssistantTextMessage text="A very long assistant answer that wraps" marginTopOnTurn={false} />, 16)
assert.ok(long.lines.length > 1 && long.lines[1].startsWith('  '), 'wrapped Markdown remains aligned after the marker')
const selected = paint(<AssistantTextMessage text="Selected" marginTopOnTurn={false} isSelected />)
const unselected = paint(<AssistantTextMessage text="Selected" marginTopOnTurn={false} />)
assert.deepEqual(selected.lines, unselected.lines, 'selection does not alter transcript content')
assert.notEqual(cellAt(selected.screen, 4, 0)?.styleId, cellAt(unselected.screen, 4, 0)?.styleId,
  'selection uses the transcript highlight')
const expanded = paint(<AssistantTextMessage text="Selected" marginTopOnTurn={false} isExpanded />)
assert.deepEqual(expanded.lines, unselected.lines, 'parent-owned expansion does not rewrite the assistant body')

console.log('assistant text contract passed (marker, Markdown, spacing, wrapping, selection, expansion)')
