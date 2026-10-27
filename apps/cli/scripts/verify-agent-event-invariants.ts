/**
 * Lifecycle invariants across ALL committed DSH JSONL fixtures,
 * both live and replay paths. Reads only scrubbed repository fixtures. No
 * processes, personal transcripts, credential stores or provider requests.
 * Run: node --import tsx/esm scripts/verify-agent-event-invariants.ts
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import type { AgentEvent } from '../src/agent/events.js'
import { createDshTranslator } from '../src/dsh-adapter/backend/translate.js'
import { setLang } from '../src/i18n.js'
import { agentEventInvariantViolations, assertAgentEventInvariants, type AgentEventInvariantOptions } from './lib/agent-event-invariants.js'

setLang('en')
type Rec = Record<string, unknown>
const FIXTURES = join(import.meta.dirname, 'fixtures')
const read = (file: string): Rec[] => readFileSync(file, 'utf8').split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line) as Rec)
const rec = (value: unknown): Rec => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Rec : {}
const jsonlFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? jsonlFiles(join(dir, entry.name)) : entry.name.endsWith('.jsonl') ? [join(dir, entry.name)] : []).sort()
let streams = 0
let eventCount = 0
const failures: string[] = []
const verify = (label: string, events: readonly AgentEvent[], options: AgentEventInvariantOptions = {}): void => {
  const errors = agentEventInvariantViolations(events, options)
  streams += 1
  eventCount += events.length
  if (errors.length > 0) failures.push(label + ':\n' + errors.map(error => '  ' + error.code + ' @' + error.index + ' ' + error.type + ': ' + error.detail).join('\n'))
  else console.log('PASS ' + label + ' (' + events.length + ' events)')
}
const unclosedSourceTurn = (source: readonly Rec[]): boolean => {
  const open = new Set<unknown>()
  for (const event of source) {
    if (event.type === 'turn/start') open.add(rec(event.data).turn)
    if (event.type === 'turn/end') open.delete(rec(event.data).turn)
  }
  return open.size > 0
}

// DSH's frames are the live tail following the durable seed, on both paths
// (the same order as the golden pipeline). Empty/missing frame files are fine.
for (const file of jsonlFiles(join(FIXTURES, 'dsh')).filter(file => !file.endsWith('.frames.jsonl'))) {
  const source = read(file)
  const frames = file.replace(/\.jsonl$/u, '.frames.jsonl')
  for (const replay of [false, true]) {
    const translator = createDshTranslator({ tools: () => undefined, scope: () => ({}), attachments: () => undefined })
    const log = source as unknown as Parameters<typeof translator.translateReplay>[0]
    const events = replay ? [...translator.translateReplay(log)] : log.flatMap(event => [...translator.translateEvent(event)])
    if (existsSync(frames)) for (const frame of read(frames)) events.push(...translator.translateFrame(frame as unknown as Parameters<typeof translator.translateFrame>[0]))
    verify(relative(FIXTURES, file) + (replay ? ' replay' : ' live'), events, { allowOpenLastTurn: unclosedSourceTurn(source) })
  }
}

// Mutation probes: prove the checker rejects each broken invariant, rather
// than passing because a fixture never exercised that branch.
const start: AgentEvent = { type: 'turn.start', turn: 1, origin: 'user', time: 0 }
const end: AgentEvent = { type: 'turn.end', turn: 1, time: 2, reason: { kind: 'completed' } }
const attempt: AgentEvent = { type: 'assistant.attempt.start', attemptId: 'a', turn: 1, step: 1 }
const message: AgentEvent = { type: 'assistant.message', seq: 1, anchor: 'a', attemptId: 'a', turn: 1, step: 1, time: 1, blocks: [], canonical: true }
const call: AgentEvent = { type: 'tool.call', callId: 'c', name: 'fixture', seq: 2, turn: 1, step: 1, time: 1, argsJson: '{}' }
const rejects = (code: string, events: readonly AgentEvent[], options?: AgentEventInvariantOptions): void => {
  assert.ok(agentEventInvariantViolations(events, options).some(error => error.code === code), 'mutation did not fail: ' + code)
}
assertAgentEventInvariants([start, attempt, message, { type: 'assistant.attempt.end', attemptId: 'a', outcome: 'committed' }, call, end])
assertAgentEventInvariants([start, message, end, { type: 'usage', turn: 1, seq: 2, time: 3, usage: { input: 1 } }])
rejects('turn-outside', [message])
rejects('turn-overlap', [start, { ...start, turn: 2 }])
rejects('turn-unclosed', [start])
rejects('seq-order', [start, message, message, end])
rejects('attempt-unclosed', [start, attempt, end])
rejects('tool-unclosed', [{ ...call, parentCallId: 'background' }])
rejects('request-unclosed', [{ type: 'question.request', request: { requestId: 'q', questions: [] } }])
rejects('request-unclosed', [{ type: 'permission.request', request: { requestId: 'p', toolName: 'fixture', options: [] } }])
rejects('pending-unseen', [{ type: 'pending.changed', items: [], claimed: ['missing'] }])
assertAgentEventInvariants([start, attempt, call], { allowOpenLastTurn: true })
assertAgentEventInvariants([{ type: 'pending.changed', items: [{ id: 'queued', text: '', placement: 'steer' }] }, { type: 'pending.changed', items: [], claimed: ['queued'] }])

if (failures.length > 0) {
  console.error(failures.join('\n\n'))
  process.exitCode = 1
} else console.log('\nverify-agent-event-invariants OK (' + streams + ' streams, ' + eventCount + ' events; mutation probes passed)')
