/** Run: node --import tsx/esm scripts/verify-thinking-tool-leaves.tsx */
import assert from 'node:assert/strict'
import React from 'react'

process.env.FORCE_COLOR = '3'
const [{ ThinkingToggle }, { ThemeProvider }, { renderToScreen }, { cellAt }, { setLang }] = await Promise.all([
  import('../src/components/ThinkingToggle.js'),
  import('../src/components/design-system/ThemeProvider.js'),
  import('../src/ink/render-to-screen.js'),
  import('../src/ink/screen.js'),
  import('../src/i18n.js'),
])

function rows(element: React.ReactElement, width = 60): string[] {
  const result = renderToScreen(<ThemeProvider theme="dark">{element}</ThemeProvider>, width)
  return Array.from({ length: result.height }, (_, row) =>
    Array.from({ length: width }, (_, column) => cellAt(result.screen, column, row)?.char ?? ' ').join('').trimEnd())
}

setLang('zh')
const shown = rows(<ThinkingToggle currentValue focusIndex={0} />)
assert.equal(shown.length, 11)
assert.equal(shown[2], '  思考过程显示')
assert.equal(shown[3], '  只控制思考过程是否显示，不改变模型的思考行为。')
assert.equal(shown[5], '  ❯ 显示 ✓')
assert.equal(shown[6], '    在对话中显示 DeepSeek 的思考过程')
assert.equal(shown[7], '    隐藏')
assert.equal(shown[10], '  Enter 确认 · Esc 退出')
const hidden = rows(<ThinkingToggle currentValue={false} focusIndex={1} />)
assert.equal(hidden[5], '    显示')
assert.equal(hidden[7], '  ❯ 隐藏 ✓')

setLang('en')
const english = rows(<ThinkingToggle currentValue={false} focusIndex={1} />)
assert.equal(english.length, 12, 'English subtitle wraps to two lines at 60 columns')
assert.equal(english[2], '  Thinking display')
assert.ok(english[3]?.startsWith('  Only controls whether reasoning is shown;'))
assert.equal(english[8], '  ❯ Hidden ✓')
assert.equal(english[11], '  Enter to confirm · Esc to exit')

console.log('thinking selector passed (zh/en layout, focus and selection)')
