import assert from 'node:assert/strict'
import { EventEmitter } from '../src/ink/events/emitter.js'
import { dispatchInputBatch } from '../src/ink/components/input-batch.js'
import { FOCUS_IN, FOCUS_OUT } from '../src/ink/termio/csi.js'
import type App from '../src/ink/components/App.js'
import type { ParsedInput, ParsedKey } from '../src/ink/parse-keypress.js'

function key(name: string, sequence: string): ParsedKey {
  return {
    kind: 'key', name, sequence, raw: sequence, fn: false, ctrl: false,
    meta: false, shift: false, option: false, super: false, isPasted: false,
  }
}

const calls: string[] = []
const emitter = new EventEmitter()
emitter.on('input', event => calls.push(`input:${event.input}`))
emitter.on('terminalfocus', () => calls.push('focus:event'))
emitter.on('terminalblur', () => calls.push('blur:event'))
const app = {
  props: {
    selection: { isDragging: false },
    onWheelAt: () => { calls.push('wheel:position'); return true },
    onPointerGestureChange: (active: boolean) => calls.push(`gesture:${active}`),
    onReleaseTail: () => calls.push('tail:release'),
    onTerminalFocus: (focused: boolean) => calls.push(`focus:probe:${focused}`),
    onClickProbe: () => calls.push('tail:click'),
    dispatchKeyboardEvent: (parsed: ParsedKey) => calls.push(`dom:${parsed.name}`),
  },
  querier: { onResponse: () => calls.push('response') },
  internal_eventEmitter: emitter,
  handleInput: (input: string) => calls.push(`host:${input}`),
  handleTerminalFocus: (focused: boolean) => calls.push(`focus:state:${focused}`),
  finishDragSession: () => calls.push('drag:end'),
  pendingReleaseTail: true,
  pendingFocusProbe: false,
  pendingClickProbe: true,
  heldButtons: 0,
  ambiguousHeld: false,
} as unknown as App

const wheel = { ...key('wheelup', '\x1b[<64;4;5M'), mouseCol: 3, mouseRow: 4, mouseButton: 64 }
const response = { kind: 'response', sequence: '\x1b[?1;2c', response: { type: 'da1', params: [1, 2] } } as ParsedInput
dispatchInputBatch(app, [response, key('a', 'a'), wheel, key('focus', FOCUS_IN)])
assert.deepEqual(calls, [
  'response', 'host:a', 'input:a', 'dom:a', 'wheel:position',
  'focus:state:true', 'focus:event', 'tail:release', 'focus:probe:true', 'tail:click',
])
assert.equal(app.pendingReleaseTail, false)
assert.equal(app.pendingFocusProbe, false)
assert.equal(app.pendingClickProbe, false)

calls.length = 0
dispatchInputBatch(app, [key('blur', FOCUS_OUT)])
assert.deepEqual(calls, [
  'focus:state:false', 'gesture:false', 'drag:end', 'focus:probe:false',
  'blur:event', 'tail:release',
])

console.log('PASS parsed input batches preserve response, key, wheel, focus and deferred-probe order')
