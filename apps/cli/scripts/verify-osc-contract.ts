/** Observable terminal-protocol contract for a future independent OSC source. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
process.env.TERM_PROGRAM = 'xterm'
const {
  CLEAR_ITERM2_PROGRESS,
  CLEAR_TAB_STATUS,
  getClipboardPath,
  LINK_END,
  OSC,
  OSC_PREFIX,
  ST,
  link,
  osc,
  parseOSC,
  parseOscColor,
  setClipboard,
  supportsTabStatus,
  tabStatus,
  tmuxLoadBuffer,
} = await import('../src/ink/termio/osc.js')

assert.equal(osc(OSC.SET_TITLE_AND_ICON, 'FlagQAI'), '\x1b]0;FlagQAI\x07')
assert.equal(osc(OSC.HYPERLINK, '', 'https://example.org'), '\x1b]8;;https://example.org\x07')
assert.equal(CLEAR_ITERM2_PROGRESS, '\x1b]9;4;0;\x07')
assert.equal(CLEAR_TAB_STATUS, '\x1b]21337;indicator=;status=;status-color=\x07')
assert.equal(LINK_END, '\x1b]8;;\x07')
assert.match(link('file:///My Project/a.ts'), /^\x1b\]8;id=[^;]+;file:\/\/\/My%20Project\/a\.ts\x07$/)
assert.equal(osc(0, 'safe\x07\x1b]52;c;AAAA'), '\x1b]0;safe]52;c;AAAA\x07')
assert.equal(link('https://example.org', { id: 'x\x1b]52;c;y' }),
  '\x1b]8;id=x]52;c;y;https://example.org\x07')

assert.deepEqual(parseOSC('0;A;B'), { type: 'title', action: { type: 'both', title: 'A;B' } })
assert.deepEqual(parseOSC('1;icon'), { type: 'title', action: { type: 'iconName', name: 'icon' } })
assert.deepEqual(parseOSC('2;title'), { type: 'title', action: { type: 'windowTitle', title: 'title' } })
assert.deepEqual(parseOSC('8;id=one:foo=bar;https://example.org'), {
  type: 'link', action: { type: 'start', url: 'https://example.org', params: { id: 'one', foo: 'bar' } },
})
assert.deepEqual(parseOSC('8;;'), { type: 'link', action: { type: 'end' } })
assert.deepEqual(parseOSC('8;incomplete'), { type: 'link', action: { type: 'end' } })
assert.deepEqual(parseOSC('21337;indicator=;status=;status-color='), {
  type: 'tabStatus', action: { indicator: null, status: null, statusColor: null },
})
assert.deepEqual(parseOSC('21337;status=a\\;b\\\\c'), {
  type: 'tabStatus', action: { status: 'a;b\\c' },
})
assert.deepEqual(parseOSC('999;unknown'), { type: 'unknown', sequence: '\x1b]999;unknown' })

assert.deepEqual(parseOscColor('#aabbcc'), { type: 'rgb', r: 170, g: 187, b: 204 })
assert.deepEqual(parseOscColor('rgb:ffff/0000/8000'), { type: 'rgb', r: 255, g: 0, b: 128 })
assert.deepEqual(parseOscColor('rgb:f/a/0'), { type: 'rgb', r: 255, g: 170, b: 0 })
assert.equal(parseOscColor('#abc'), null)
assert.equal(parseOscColor('rgb:12345/ff/00'), null)

assert.equal(tabStatus({ status: 'a;b\\c', statusColor: { type: 'rgb', r: 1, g: 2, b: 3 } }),
  '\x1b]21337;status=a\\;b\\\\c;status-color=#010203\x07')
assert.equal(tabStatus({}), '\x1b]21337;\x07')
const previous = process.env.FLAGQAI_TAB_STATUS
delete process.env.FLAGQAI_TAB_STATUS
assert.equal(supportsTabStatus(), false)
process.env.FLAGQAI_TAB_STATUS = '1'
assert.equal(supportsTabStatus(), true)
if (previous === undefined) delete process.env.FLAGQAI_TAB_STATUS
else process.env.FLAGQAI_TAB_STATUS = previous

const modulePath = fileURLToPath(new URL('../src/ink/termio/osc.ts', import.meta.url))
const child = spawnSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e',
  `const m=await import(${JSON.stringify(modulePath)}); console.log(JSON.stringify({prefix:m.OSC_PREFIX, st:m.ST, sequence:m.osc(0,'x'), wrapped:m.wrapForMultiplexer(m.osc(0,'x'))}))`], {
  cwd: process.cwd(), encoding: 'utf8',
  env: { ...process.env, TERM_PROGRAM: 'kitty', TMUX: '/tmp/flagqai-test-tmux' },
})
assert.equal(child.status, 0, child.stderr)
assert.deepEqual(JSON.parse(child.stdout.trim()), {
  prefix: OSC_PREFIX, st: ST, sequence: '\x1b]0;x\x1b\\',
  wrapped: '\x1bPtmux;\x1b\x1b]0;x\x1b\x1b\\\x1b\\',
})
const screenChild = spawnSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e',
  `const m=await import(${JSON.stringify(modulePath)}); console.log(JSON.stringify(m.wrapForMultiplexer(m.osc(0,'x'))))`], {
  cwd: process.cwd(), encoding: 'utf8',
  env: { ...process.env, TERM_PROGRAM: 'xterm', TMUX: '', STY: 'screen' },
})
assert.equal(screenChild.status, 0, screenChild.stderr)
assert.equal(JSON.parse(screenChild.stdout.trim()), '\x1bP\x1b]0;x\x07\x1b\\')

if (process.platform === 'darwin') {
  // Replace external executables so this regression never changes the user's
  // actual clipboard or tmux server.
  const dir = mkdtempSync(join(tmpdir(), 'flagqai-osc-clipboard-'))
  const previousPath = process.env.PATH
  const previousTmux = process.env.TMUX
  const previousCapture = process.env.FLAGQAI_CLIP_CAPTURE
  try {
    const capture = join(dir, 'captured.txt')
    const fakePbcopy = join(dir, 'pbcopy')
    const fakeTmux = join(dir, 'tmux')
    writeFileSync(fakePbcopy, '#!/bin/sh\n/bin/cat > "$FLAGQAI_CLIP_CAPTURE"\n')
    writeFileSync(fakeTmux, '#!/bin/sh\nprintf "%s" "$*" > "$FLAGQAI_CLIP_CAPTURE.args"\n/bin/cat > "$FLAGQAI_CLIP_CAPTURE"\n')
    chmodSync(fakePbcopy, 0o700)
    chmodSync(fakeTmux, 0o700)
    process.env.PATH = dir
    process.env.FLAGQAI_CLIP_CAPTURE = capture
    delete process.env.TMUX
    // Native clipboard calls are best-effort with a two-second timeout. Under
    // a loaded preflight worker pool, retry the fake executable until one
    // invocation actually starts; a persistent failure still fails the gate.
    let nativeSequence = ''
    for (let attempt = 0; attempt < 3 && !existsSync(capture); attempt++) {
      nativeSequence = await setClipboard('quantum ✓')
    }
    assert.equal(nativeSequence,
      '\x1b]52;c;cXVhbnR1bSDinJM=\x07')
    assert.equal(readFileSync(capture, 'utf8'), 'quantum ✓')
    process.env.TMUX = '/tmp/flagqai-test-tmux'
    let tmuxLoaded = false
    for (let attempt = 0; attempt < 3 && !tmuxLoaded; attempt++) {
      tmuxLoaded = await tmuxLoadBuffer('tmux ✓')
    }
    assert.equal(tmuxLoaded, true)
    assert.equal(readFileSync(`${capture}.args`, 'utf8'), 'load-buffer -w -')
    assert.equal(readFileSync(capture, 'utf8'), 'tmux ✓')
    writeFileSync(fakePbcopy, '#!/bin/sh\nexit 1\n')
    chmodSync(fakePbcopy, 0o700)
    delete process.env.TMUX
    assert.equal(await setClipboard('fallback'), '\x1b]52;c;ZmFsbGJhY2s=\x07')
  } finally {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    if (previousTmux === undefined) delete process.env.TMUX
    else process.env.TMUX = previousTmux
    if (previousCapture === undefined) delete process.env.FLAGQAI_CLIP_CAPTURE
    else process.env.FLAGQAI_CLIP_CAPTURE = previousCapture
    rmSync(dir, { recursive: true, force: true })
  }
}

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
const savedTmux = process.env.TMUX
try {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  delete process.env.TMUX
  assert.equal(getClipboardPath(), 'osc52')
  assert.equal(await setClipboard('local'), '\x1b]52;c;bG9jYWw=\x07')
  process.env.TMUX = '/tmp/flagqai-test-tmux'
  assert.equal(getClipboardPath(), 'tmux-buffer')
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  delete process.env.TMUX
  assert.equal(getClipboardPath(), 'osc52')
} finally {
  Object.defineProperty(process, 'platform', platformDescriptor)
  if (savedTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = savedTmux
}

console.log('OSC protocol contract passed (serialization, parser, color, status, mux, sanitizer, clipboard)')
