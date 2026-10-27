/** Run: node --import tsx/esm scripts/verify-themed-primitives.tsx */
import assert from 'node:assert/strict'
import React from 'react'

process.env.FORCE_COLOR = '3'
const [
  { default: ThemedText, TextHoverColorContext },
  { default: ThemedBox },
  { ThemeProvider },
  { getTheme },
  { renderToScreen },
  { cellAt },
] = await Promise.all([
  import('../src/components/design-system/ThemedText.js'),
  import('../src/components/design-system/ThemedBox.js'),
  import('../src/components/design-system/ThemeProvider.js'),
  import('../src/theme.js'),
  import('../src/ink/render-to-screen.js'),
  import('../src/ink/screen.js'),
])

const dark = getTheme('dark')
function paint(element: React.ReactElement, theme = 'dark') {
  return renderToScreen(<ThemeProvider theme={theme}>{element}</ThemeProvider>, 32)
}
function style(element: React.ReactElement, column = 0, row = 0, theme = 'dark') {
  return cellAt(paint(element, theme).screen, column, row)?.styleId
}

assert.equal(style(<ThemedText color="accent">A</ThemedText>),
  style(<ThemedText color={dark.accent as `#${string}`}>A</ThemedText>),
  'a palette key paints the same as its raw terminal color')
assert.notEqual(style(<ThemedText color="accent">A</ThemedText>),
  style(<ThemedText color="warning">A</ThemedText>),
  'different semantic colors paint differently')
assert.equal(style(<ThemedText backgroundColor="accent">A</ThemedText>),
  style(<ThemedText backgroundColor={dark.accent as `#${string}`}>A</ThemedText>),
  'background colors also resolve through the active palette')
assert.equal(style(<ThemedText dimColor bold>A</ThemedText>),
  style(<ThemedText color="inactive" bold>A</ThemedText>),
  'semantic dim retains bold and paints the inactive color')
assert.equal(style(<ThemedText color="success" dimColor>A</ThemedText>),
  style(<ThemedText color="inactive">A</ThemedText>),
  'disabled rows stay inactive even when the child also requests a color')

const hover = (child: React.ReactElement) =>
  <TextHoverColorContext.Provider value="warning">{child}</TextHoverColorContext.Provider>
assert.equal(style(hover(<ThemedText>A</ThemedText>)), style(<ThemedText color="warning">A</ThemedText>),
  'hover supplies an otherwise unset foreground')
assert.equal(style(hover(<ThemedText dimColor>A</ThemedText>)), style(<ThemedText color="inactive">A</ThemedText>),
  'semantic dim takes precedence over hover')
assert.equal(style(hover(<ThemedText color="success">A</ThemedText>)), style(<ThemedText color="success">A</ThemedText>),
  'explicit foreground takes precedence over hover')

const themedBorder = <ThemedBox width={7} height={3} borderStyle="single" borderColor="accent" borderTopColor="warning" />
const literalBorder = <ThemedBox width={7} height={3} borderStyle="single"
  borderColor={dark.accent as `#${string}`} borderTopColor={dark.warning as `#${string}`} />
const boxA = paint(themedBorder).screen
const boxB = paint(literalBorder).screen
for (const [column, row] of [[3, 0], [0, 1], [6, 1], [3, 2]]) {
  assert.equal(cellAt(boxA, column, row)?.styleId, cellAt(boxB, column, row)?.styleId,
    `border segment ${column},${row} resolves the semantic color`)
}
assert.notEqual(cellAt(boxA, 3, 0)?.styleId, cellAt(boxA, 0, 1)?.styleId,
  'a side-specific border color overrides the shorthand')
assert.equal(style(<ThemedBox width={7} backgroundColor="accent"><ThemedText>A</ThemedText></ThemedBox>),
  style(<ThemedBox width={7} backgroundColor={dark.accent as `#${string}`}><ThemedText>A</ThemedText></ThemedBox>),
  'box background resolves through the palette')

assert.notEqual(style(<ThemedText color="accent">A</ThemedText>, 0, 0, 'light'),
  style(<ThemedText color="accent">A</ThemedText>, 0, 0, 'dark'),
  'the same semantic key follows the active theme')
console.log('themed primitives passed (palette, literals, precedence, border sides, background, theme selection)')
