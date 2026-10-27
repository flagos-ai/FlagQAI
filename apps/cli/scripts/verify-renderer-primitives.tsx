/** Run: node --import tsx/esm scripts/verify-renderer-primitives.tsx */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'ghostty'

const [assertModule, React, { Ansi }, { default: Box }, { default: Text }, { default: Newline }, { renderToScreen, scanPositions, applyPositionedHighlight }, { cellAt, StylePool }] = await Promise.all([
  import('node:assert/strict'), import('react'), import('../src/ink/Ansi.js'),
  import('../src/ink/components/Box.js'), import('../src/ink/components/Text.js'),
  import('../src/ink/components/Newline.js'),
  import('../src/ink/render-to-screen.js'), import('../src/ink/screen.js'),
])
const assert = assertModule.default

function snapshot(element: React.ReactElement, width = 12) {
  const result = renderToScreen(element, width)
  return Array.from({ length: result.height }, (_, row) =>
    Array.from({ length: width }, (_, col) => {
      const cell = cellAt(result.screen, col, row)!
      return { char: cell.char, width: cell.width, styleId: cell.styleId, hyperlink: cell.hyperlink }
    }))
}

assert.deepEqual(snapshot(<Ansi>{'\x1b[1;31m红A\x1b[0mB'}</Ansi>),
  snapshot(<Text><Text color="ansi:red" bold>红A</Text>B</Text>), 'ANSI spans preserve CJK width and reset style')
assert.deepEqual(snapshot(<Ansi dimColor>{'\x1b[1;34m蓝色\x1b[0m'}</Ansi>),
  snapshot(<Text dim><Text color="ansi:blue" dim>蓝色</Text></Text>), 'forced dim takes precedence over bold')
assert.deepEqual(snapshot(<Ansi>{'\x1b[48;2;11;22;33mX\x1b[0m'}</Ansi>),
  snapshot(<Text><Text backgroundColor="rgb(11,22,33)">X</Text></Text>), 'RGB background survives ANSI projection')
assert.deepEqual(snapshot(<Ansi>{'\x1b[38;5;174mI\x1b[0m'}</Ansi>),
  snapshot(<Text><Text color="ansi256(174)">I</Text></Text>), 'indexed foreground survives ANSI projection')
assert.deepEqual(snapshot(<Ansi>{'\x1b[94mB\x1b[0m'}</Ansi>),
  snapshot(<Text><Text color="ansi:blueBright">B</Text></Text>), 'bright named colors follow renderer naming')
assert.deepEqual(snapshot(<Ansi>{'\x1b[3;4;9mS\x1b[0m'}</Ansi>),
  snapshot(<Text><Text italic underline strikethrough>S</Text></Text>), 'text decorations survive ANSI projection')
assert.deepEqual(snapshot(<Ansi>{'e\u0301 中文\nnext'}</Ansi>, 8),
  snapshot(<Text>{'e\u0301 中文\nnext'}</Text>, 8), 'combining characters and line breaks match text layout')
assert.deepEqual(snapshot(<Ansi>{'\x1b[31mA\x1b[2mB\x1b[0mC'}</Ansi>),
  snapshot(<Text><Text color="ansi:red">A</Text><Text color="ansi:red" dim>B</Text>C</Text>),
  'SGR dim applies only after its boundary and reset clears it')
const linked = renderToScreen(<Ansi>{'\x1b]8;;https://example.org\x07LINK\x1b]8;;\x07TAIL'}</Ansi>, 16)
assert.equal(cellAt(linked.screen, 0, 0)?.hyperlink, 'https://example.org', 'OSC 8 link metadata reaches the linked run')
assert.equal(cellAt(linked.screen, 4, 0)?.hyperlink, undefined, 'OSC 8 end clears link metadata for following text')
assert.equal(renderToScreen(<Ansi>{'\x1b[31m\x1b[0m'}</Ansi>, 10).height, 0, 'control-only content produces no row')
assert.equal(renderToScreen(<Text>{null}</Text>, 10).height, 0, 'absent text produces no row')
assert.equal(renderToScreen(<Text>{''}</Text>, 10).height, 0, 'empty text produces no layout node')
assert.equal(renderToScreen(<Text>{false}</Text>, 10).height, 0, 'a conditional false child produces no layout node')
assert.deepEqual(scanPositions(renderToScreen(<Text>{0}</Text>, 10).screen, '0'),
  [{ row: 0, col: 0, len: 1 }], 'numeric zero remains visible text')
let textLeaf: unknown
renderToScreen(<Text ref={node => { if (node) textLeaf = node }}>cursor target</Text>, 20)
assert.equal((textLeaf as { nodeName?: string } | undefined)?.nodeName, 'ink-text',
  'the public ref points to the text leaf for cursor placement')
assert.equal(renderToScreen(<ink-raw-ansi rawText="" rawWidth={10} rawHeight={0} />, 10).height, 0,
  'empty preformatted output produces no row')

const lines = renderToScreen(<Text>one<Newline count={2} />three</Text>, 12)
assert.deepEqual(scanPositions(lines.screen, 'three'), [{ row: 2, col: 0, len: 5 }], 'Newline keeps blank rows')
const layout = renderToScreen(<Box paddingLeft={2} flexDirection="column"><Text>A</Text><Text>中B</Text></Box>, 12)
assert.deepEqual(scanPositions(layout.screen, '中B'), [{ row: 1, col: 2, len: 3 }], 'Box padding and column direction use display cells')
const raw = renderToScreen(<ink-raw-ansi rawText={'first\n\x1b[31msecond\x1b[0m'} rawWidth={10} rawHeight={2} />, 10)
assert.equal(raw.height, 2)
assert.deepEqual(scanPositions(raw.screen, 'second'), [{ row: 1, col: 0, len: 6 }])

const searched = renderToScreen(<Text>A中B A中B</Text>, 20)
assert.deepEqual(scanPositions(searched.screen, '中b'), [
  { row: 0, col: 1, len: 3 },
  { row: 0, col: 6, len: 3 },
], 'search positions count display cells, including wide glyphs')
assert.deepEqual(scanPositions(searched.screen, ''), [], 'empty search has no positions')
const searchStyles = new StylePool()
assert.equal(applyPositionedHighlight(searched.screen, searchStyles,
  [{ row: 0, col: 1, len: 3 }], 0, 0), true)
assert.equal(cellAt(searched.screen, 1, 0)?.styleId,
  searchStyles.withCurrentMatch(searchStyles.none), 'the current match receives its distinct style')
assert.equal(cellAt(searched.screen, 2, 0)?.styleId, searchStyles.none,
  'the spacer after a wide glyph is not painted independently')
assert.equal(applyPositionedHighlight(searched.screen, searchStyles,
  [{ row: 0, col: 1, len: 3 }], -1, 0), false, 'offscreen positions are ignored')

console.log('renderer primitives passed (ANSI styles, resets, CJK, empty output, newlines and layout)')
