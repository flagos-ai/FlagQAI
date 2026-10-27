/** Run: node --import tsx/esm scripts/verify-working-spinner-shell.tsx */
import assert from 'node:assert/strict'
import React from 'react'
import { PassThrough, Writable } from 'node:stream'

process.env.FORCE_COLOR = '3'
const [{ Terminal }, { render, Text, ThemeProvider }, { WorkingSpinner, useThinkingStatus },
  { setLang, tOr }, { SPINNER_VERBS }, { settled }] = await Promise.all([
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/WorkingSpinner.js'),
  import('../src/i18n.js'),
  import('../src/terminal-utils/spinnerVerbs.js'),
  import('./lib/term-test.mjs'),
])

function terminal(columns: number) {
  const screen = new Terminal({ cols: columns, rows: 12, scrollback: 1000, allowProposedApi: true })
  class Output extends Writable {
    columns = columns
    rows = 12
    isTTY = true
    _write(chunk: unknown, _encoding: BufferEncoding, done: () => void) { screen.write(String(chunk), done) }
  }
  class Input extends PassThrough {
    isTTY = true
    setRawMode() { return this }
    ref() { return this }
    unref() { return this }
  }
  const stdout = new Output() as Output & NodeJS.WriteStream
  const stdin = new Input() as Input & NodeJS.ReadStream
  const lines = () => Array.from({ length: 12 }, (_, y) =>
    screen.buffer.active.getLine(screen.buffer.active.viewportY + y)?.translateToString(true) ?? '')
  return { stdout, stdin, lines }
}

setLang('zh')
const wide = terminal(100)
const refs = {
  responseLengthRef: { current: 400 }, uploadTokensRef: { current: 123 },
  loadingStartTimeRef: { current: Date.now() - 1400 }, totalPausedMsRef: { current: 0 },
  pauseStartTimeRef: { current: null }, thinkingStatus: null,
}
const view = (mode: 'responding' | 'requesting', suffix?: string) =>
  <ThemeProvider theme="dark"><WorkingSpinner mode={mode} hasActiveTools={false} {...refs} suffix={suffix} /></ThemeProvider>
const app = await render(view('responding'), { stdout: wide.stdout, stdin: wide.stdin,
  terminalImages: false, patchConsole: false })
try {
  const zhVerbs = SPINNER_VERBS.map(verb => tOr(`spinner-verb-${verb.toLowerCase()}`, verb))
  assert.ok(await settled(() => wide.lines().some(line =>
    zhVerbs.some(verb => line.includes(`${verb}…`)) && line.includes('↑ 123 · ↓ 100 tokens'))),
  'a localized working verb and real counters appear in the terminal')
  app.rerender(view('requesting', 'compacting'))
  assert.ok(await settled(() => wide.lines().some(line =>
    line.includes('(compacting ·') && line.includes('↑ ↑ 123'))),
  'the requesting phase and suffix update without a new session')
  setLang('en')
  assert.ok(await settled(() => wide.lines().some(line =>
    SPINNER_VERBS.some(verb => line.includes(`${verb}…`)))),
  'runtime language switching updates the existing spinner')
} finally {
  app.unmount()
  app.cleanup()
}

setLang('en')
const narrow = terminal(30)
const randomBeforeNarrow = Math.random
Math.random = () => 3 / SPINNER_VERBS.length // Select the long "Considering" verb.
const narrowApp = await render(view('responding', 'compacting'), {
  stdout: narrow.stdout, stdin: narrow.stdin, terminalImages: false, patchConsole: false,
})
try {
  assert.ok(await settled(() => narrow.lines().some(line =>
    line.includes('Working…') && line.includes('compacting') && /\d+s/.test(line))),
  'a narrow screen keeps the activity word, suffix, and elapsed time')
  assert.ok(narrow.lines().every(line => !line.includes('tokens')),
    'the narrow screen omits token counters instead of wrapping them')
} finally {
  Math.random = randomBeforeNarrow
  narrowApp.unmount()
  narrowApp.cleanup()
}

function Thought({ active }: { active: boolean }) {
  const status = useThinkingStatus(active)
  return <Text>{status === null ? 'thought:none' : `thought:${status}`}</Text>
}
const thoughtTerm = terminal(40)
const thoughtApp = await render(<Thought active />, {
  stdout: thoughtTerm.stdout, stdin: thoughtTerm.stdin, terminalImages: false, patchConsole: false,
})
try {
  assert.ok(await settled(() => thoughtTerm.lines().some(line => line.includes('thought:thinking'))))
  thoughtApp.rerender(<Thought active={false} />)
  assert.ok(await settled(() => thoughtTerm.lines().some(line => /thought:\d+/.test(line))),
    'the completed thinking duration is visible')
  assert.ok(await settled(() => thoughtTerm.lines().some(line => line.includes('thought:none')), { timeoutMs: 4000 }),
    'the completed duration expires after its grace period')
} finally {
  thoughtApp.unmount()
  thoughtApp.cleanup()
}

console.log('working spinner shell verified (live modes, language, narrow screen and thought grace)')
