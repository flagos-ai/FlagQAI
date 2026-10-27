import assert from 'node:assert/strict'
import { appendChildNode, createNode, createTextNode, setStyle } from '../src/ink/dom.js'
import { LayoutMeasureMode as MeasureMode, type LayoutMeasureMode } from '../src/ink/layout/node.js'
import type { Styles } from '../src/ink/styles.js'

type Probe = readonly [string, string, number, LayoutMeasureMode, Styles, number, number]
const decorated: Styles = { decoration: { header: '╭──╮', prefix: { text: '│ ', width: 2 } } }
const probes: readonly Probe[] = [
  ['short', 'hello', 20, MeasureMode.Exactly, {}, 5, 1],
  ['wrap', 'alpha beta gamma', 6, MeasureMode.Exactly, {}, 6, 3],
  ['whole-word gaps', 'abcd efgh ijkl mnop', 8, MeasureMode.Exactly, {}, 8, 4],
  ['newlines', 'one two\nthree four', 5, MeasureMode.Exactly, {}, 5, 4],
  ['intrinsic', 'one two\nthree four', 5, MeasureMode.Undefined, {}, 10, 2],
  ['tabs', 'a\tb', 5, MeasureMode.Exactly, {}, 5, 2],
  ['wide', '中文 é 👩‍💻', 6, MeasureMode.Exactly, {}, 6, 2],
  ['truncate', 'alpha beta gamma', 6, MeasureMode.Exactly, { textWrap: 'truncate' }, 6, 1],
  ['decorated', 'alpha beta gamma', 8, MeasureMode.Exactly, decorated, 8, 4],
  ['header only', '', 8, MeasureMode.Exactly, decorated, 4, 1],
  ['fractional width', 'abcde', 0.5, MeasureMode.Exactly, {}, 5, 10],
]

for (const [name, value, width, mode, style, expectedWidth, expectedHeight] of probes) {
  const node = createNode('ink-text')
  appendChildNode(node, createTextNode(value))
  setStyle(node, style)
  const measure = node.yogaNode?.getMeasureFunction()
  assert.ok(measure, `${name}: text nodes must own a layout measure function`)
  assert.deepEqual(measure(width, mode),
    { width: expectedWidth, height: expectedHeight }, name)
  node.yogaNode?.freeRecursive()
}

for (const kind of ['ink-virtual-text', 'ink-link', 'ink-progress'] as const) {
  assert.equal(createNode(kind).yogaNode, undefined, `${kind} is an inline-only element`)
}
const raw = createNode('ink-raw-ansi')
raw.attributes.rawWidth = 9
raw.attributes.rawHeight = 3
assert.deepEqual(raw.yogaNode?.getMeasureFunction()?.(1, MeasureMode.Exactly),
  { width: 9, height: 3 }, 'pre-rendered ANSI declares its own cell dimensions')
raw.yogaNode?.freeRecursive()

console.log('Ink text measurement contract preserves golden widths, rows, inline kinds, and raw ANSI dimensions')
