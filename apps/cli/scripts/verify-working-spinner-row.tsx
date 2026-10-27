/** Run: node --import tsx/esm scripts/verify-working-spinner-row.tsx */
import assert from 'node:assert/strict'
import React from 'react'

process.env.FORCE_COLOR = '3'
const [{ SpinnerAnimationRow, workingSpinnerDetails }, { ThemeProvider }, { renderToScreen }, { cellAt }] = await Promise.all([
  import('../src/components/Spinner/SpinnerAnimationRow.js'),
  import('../src/components/design-system/ThemeProvider.js'),
  import('../src/ink/render-to-screen.js'),
  import('../src/ink/screen.js'),
])

const base = { now: 10_000, startedAt: 8_600, pausedMs: 0, pauseStartedAt: null,
  uploadTokens: 123, responseChars: 400, mode: 'responding' as const,
  thinkingStatus: null, columns: 100 }
assert.equal(workingSpinnerDetails(base), '1s · ↓ ↑ 123 · ↓ 100 tokens')
assert.equal(workingSpinnerDetails({ ...base, mode: 'requesting', thinkingStatus: 'thinking' }),
  '1s · ↑ ↑ 123 · ↓ 100 tokens · thinking')
assert.equal(workingSpinnerDetails({ ...base, thinkingStatus: 5600, suffix: 'compacting' }),
  'compacting · 1s · ↓ ↑ 123 · ↓ 100 tokens · thought for 6s')
assert.equal(workingSpinnerDetails({ ...base, columns: 24, suffix: 'compacting' }), 'compacting · 1s')
assert.equal(workingSpinnerDetails({ ...base, now: 13_000, pausedMs: 1000, pauseStartedAt: 12_000 }),
  '2s · ↓ ↑ 123 · ↓ 100 tokens', 'elapsed time excludes completed and live pauses')

const clock = Date.now
Date.now = () => 10_000
const props = { mode: 'responding' as const, reducedMotion: true, hasActiveTools: false,
  responseLengthRef: { current: 400 }, uploadTokensRef: { current: 123 },
  message: 'Probing', messageColor: 'text' as const, shimmerColor: 'accent' as const,
  loadingStartTimeRef: { current: 8_600 }, totalPausedMsRef: { current: 0 },
  pauseStartTimeRef: { current: null }, spinnerSuffix: null, verbose: true,
  columns: 100, thinkingStatus: null }
function rows(width: number, overrides: Partial<typeof props> = {}) {
  const result = renderToScreen(<ThemeProvider theme="dark"><SpinnerAnimationRow {...props} {...overrides} /></ThemeProvider>, width)
  return Array.from({ length: result.height }, (_, y) =>
    Array.from({ length: width }, (_, x) => cellAt(result.screen, x, y)?.char ?? ' ').join('').trimEnd())
}
try {
  assert.deepEqual(rows(100), ['', '● Probing (1s · ↓ ↑ 123 · ↓ 100 tokens)'])
  assert.deepEqual(rows(100, { verbose: false }), ['', '● Probing'])
  assert.deepEqual(rows(100, { mode: 'thinking', thinkingStatus: 'thinking' }),
    ['', '● Probing (1s · ↓ ↑ 123 · ↓ 100 tokens · thinking)'])
  const narrow = rows(24, { columns: 24, spinnerSuffix: 'compacting' })
  assert.equal(narrow.length, 2, 'status stays one row tall after its top gap')
  assert.ok(narrow[1]?.startsWith('● Probing ('), 'narrow truncation preserves the message prefix')
  const wideCjk = rows(100, { message: '处理中' })
  assert.equal(wideCjk.length, 2, 'wide characters do not add a row')
  assert.ok(wideCjk[1]?.startsWith('● 处理中 '))
} finally {
  Date.now = clock
}

console.log('working spinner row verified (modes, counters, pauses and narrow terminal)')
