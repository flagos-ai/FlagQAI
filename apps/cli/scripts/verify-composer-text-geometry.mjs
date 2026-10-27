import assert from 'node:assert/strict'
import {
  caretInText, clickToCursorOffset, graphemeBoundaries, nextGraphemeBoundary,
  normalizeCursorOffset, previousGraphemeBoundary, vimLineStart,
  vimWordBackward, vimWordEnd, vimWordForward, visualLineRanges,
  wordBoundaryLeft, wordBoundaryRight, wordSelectionAt, wrapToWidth,
} from '../src/components/composerTextGeometry.ts'

const graphemes = 'A👩‍🔬中'
const boundaries = graphemeBoundaries(graphemes)
assert.deepEqual(boundaries, [0, 1, 6, 7])
assert.equal(previousGraphemeBoundary(boundaries, 6), 1)
assert.equal(nextGraphemeBoundary(boundaries, 1), 6)
assert.equal(normalizeCursorOffset(graphemes, 3), 1, 'a caret never splits a ZWJ cluster')

const wrapped = `${'x'.repeat(70)} classification`
assert.deepEqual(wrapToWidth(wrapped, 75), [`${'x'.repeat(70)} `, 'classification'])
assert.deepEqual(visualLineRanges(wrapped, 75), [[0, 71], [71, wrapped.length]])
assert.deepEqual(caretInText(wrapped, 75, 78), { line: 1, charCol: 7, visualCol: 7 })
assert.equal(clickToCursorOffset(wrapped, 75, 1, 3), 74)
assert.equal(clickToCursorOffset(wrapped, 75, 1, 80), wrapped.length)

assert.deepEqual(wrapToWidth('甲乙丙', 4), ['甲乙', '丙'])
assert.equal(clickToCursorOffset('甲乙丙', 4, 0, 1, 'grapheme-start'), 0)
assert.equal(clickToCursorOffset('甲乙丙', 4, 0, 3, 'grapheme-start'), 1)
assert.deepEqual(wordSelectionAt('alpha 世界', 7, 0, 8), { start: 6, end: 8 })
assert.equal(wordBoundaryLeft('one foo-bar', 11), 4)
assert.equal(wordBoundaryRight('one foo-bar next', 4), 12)
assert.equal(vimWordBackward('one foo-bar', 11), 4)
assert.equal(vimWordForward('one foo-bar next', 4), 12)
assert.equal(vimWordEnd('one foo-bar next', 4), 11)
assert.equal(vimLineStart('\nnext', 0), 0)
assert.equal(vimLineStart('\nnext', 1), 1)

console.log('composer text geometry passed (graphemes, whole-word wrapping, caret, click and selection)')
