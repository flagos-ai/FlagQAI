/** Run: node --import tsx/esm scripts/verify-spinner-color-math.ts */
import assert from 'node:assert/strict'
import {
  getDefaultCharacters, hueToRgb, interpolateColor, parseRGB, toRGBColor,
} from '../src/components/Spinner/spinnerUtils.js'

const first = getDefaultCharacters()
assert.deepEqual(first, ['·', '•', '●', '•'])
first[0] = 'changed'
assert.equal(getDefaultCharacters()[0], '·', 'frame lists must not share mutable storage')

assert.deepEqual(interpolateColor({ r: 0, g: 127, b: 255 }, { r: 255, g: 255, b: 0 }, 0.25),
  { r: 64, g: 159, b: 191 })
assert.deepEqual(interpolateColor({ r: 0, g: 127, b: 255 }, { r: 255, g: 255, b: 0 }, 1),
  { r: 255, g: 255, b: 0 })
assert.equal(toRGBColor({ r: 64, g: 159, b: 191 }), 'rgb(64,159,191)')

for (const [hue, expected] of [
  [0, { r: 224, g: 82, b: 82 }],
  [60, { r: 224, g: 224, b: 82 }],
  [120, { r: 82, g: 224, b: 82 }],
  [180, { r: 82, g: 224, b: 224 }],
  [240, { r: 82, g: 82, b: 224 }],
  [300, { r: 224, g: 82, b: 224 }],
] as const) assert.deepEqual(hueToRgb(hue), expected)
assert.deepEqual(hueToRgb(-60), hueToRgb(300))
assert.deepEqual(hueToRgb(420), hueToRgb(60))

assert.deepEqual(parseRGB('rgb( 1, 2, 3 )'), { r: 1, g: 2, b: 3 })
assert.deepEqual(parseRGB('rgb(256,2,3)'), { r: 256, g: 2, b: 3 })
assert.equal(parseRGB('RGB(1,2,3)'), null)
assert.equal(parseRGB('rgb(-1,2,3)'), null)
assert.equal(parseRGB('rgba(1,2,3,1)'), null)
assert.equal(parseRGB('rgb(1,2,3)'), parseRGB('rgb(1,2,3)'), 'valid parses are cached')

console.log('spinner color math passed (independent frames, RGB blend/parse, HSL wheel)')
