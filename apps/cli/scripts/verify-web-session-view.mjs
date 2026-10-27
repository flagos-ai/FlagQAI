import assert from 'node:assert/strict'
import { createWebSessionView } from '../lib/types/dsh-adapter/web-session-view.js'
import { MAX_ROWS } from '../lib/types/channel/transcript.js'

const session = { cwd: '/workspace', ref: { backendId: 'test', sessionId: 'test-session' } }
const wire = value => JSON.parse(JSON.stringify(value))
const live = { replay: false, wake: 'sync' }
const projection = createWebSessionView(session)
const delta = (text, attemptId = 'first') => ({ type: 'assistant.delta', attemptId, index: 0, time: 1, delta: { kind: 'text', text } })
projection.apply([{ type: 'assistant.attempt.start', attemptId: 'first', turn: 1, step: 1 }, delta('Discard this')], live)
const abandoned = wire(projection.apply([{ type: 'assistant.attempt.end', attemptId: 'first', outcome: 'abandoned' }], live))
assert.ok(abandoned.removed.length > 0, 'abandoned provisional rows are removed')
projection.apply([{ type: 'assistant.attempt.start', attemptId: 'second', turn: 1, step: 1 }, delta('Answer', 'second')], live)
const message = { type: 'assistant.message', attemptId: 'second', seq: 1, anchor: '1', turn: 1, step: 1, time: 1, canonical: true, blocks: [{ type: 'reasoning', text: 'Check carefully' }, { type: 'text', text: 'Answer' }], usage: { input: 12, output: 4 } }
const call = { type: 'tool.call', callId: 'tool-1', name: 'Read', seq: 2, turn: 1, step: 1, time: 2, argsJson: '{"file":"package.json"}' }
const result = { type: 'tool.result', callId: 'tool-1', seq: 3, turn: 1, step: 1, time: 3, isError: true, errorText: 'Missing file', text: 'Missing file', content: [{ type: 'text', text: 'Missing file' }] }
projection.apply([message, call, result], live)
const snapshot = wire(projection.snapshot())
assert.equal(snapshot.rows.filter(row => row.kind === 'assistant').length, 1)
assert.equal(snapshot.rows.find(row => row.kind === 'assistant').text, 'Answer')
assert.equal(snapshot.rows.find(row => row.kind === 'reasoning').text, 'Check carefully')
assert.equal(snapshot.rows.find(row => row.kind === 'tool').tool.status, 'error')
assert.equal(snapshot.tokens.input, 12)
const duplicate = projection.apply([message, result], live)
assert.equal(duplicate.rows.length, 0, 'duplicate durable sequence emits no row changes')
assert.equal(duplicate.tokens.input, 12, 'duplicate usage is not booked twice')
const replay = createWebSessionView(session)
replay.apply([message, call, result], { replay: true, wake: 'sync' })
const normalize = view => view.rows.map(row => ({ kind: row.kind, text: row.text, status: row.tool?.status }))
assert.deepEqual(normalize(wire(replay.snapshot())), normalize(snapshot), 'live and restored transcript agree')
for (let i = 0; i < MAX_ROWS + 2; i++) projection.apply([{ type: 'notice', level: 'info', text: `Notice ${i}` }], live)
assert.equal(projection.snapshot().rows.length, MAX_ROWS, 'wire window is bounded')
assert.ok(snapshot.commands.some(command => command.name === 'resume'))
assert.ok(!snapshot.commands.some(command => command.name === 'rewind'), 'unsupported Web actions are not advertised')
console.log('Web shared projection OK (rollback, replay, seq idempotency, tools, usage, bounded snapshots)')

const firstTodos = [{ content: 'Read source', status: 'completed' }, { content: 'Run checks', status: 'in_progress' }, { content: 'Report results', status: 'pending' }]
const secondTodos = firstTodos.map(item => ({ ...item, status: 'completed' }))
const todoLive = createWebSessionView(session)
assert.deepEqual(todoLive.snapshot().todos, [], 'no native todo starts hidden')
assert.deepEqual(wire(todoLive.apply([{ type: 'todo.write', items: firstTodos }], live)).todos, firstTodos)
assert.deepEqual(wire(todoLive.apply([{ type: 'todo.write', items: secondTodos }], live)).todos, secondTodos)
const todoRestored = createWebSessionView(session)
assert.deepEqual(wire(todoRestored.apply([{ type: 'todo.write', items: firstTodos }, { type: 'todo.write', items: secondTodos }], { replay: true, wake: 'sync' })).todos, secondTodos, 'durable replay restores the latest list')
const nextTask = { type: 'user.message', id: 'task-2', source: 'user', text: 'Start a new task', blocks: [{ type: 'text', text: 'Start a new task' }] }
assert.deepEqual(wire(todoLive.apply([nextTask], live)).todos, [], 'a new human task clears the completed prior list')
assert.deepEqual(wire(todoRestored.apply([nextTask], { replay: true, wake: 'sync' })).todos, [], 'durable replay reaches the same task boundary')
assert.deepEqual(wire(todoLive.apply([{ type: 'todo.write', items: firstTodos }], live)).todos, firstTodos, 'the next task can start a fresh list')
assert.deepEqual(wire(todoLive.apply([{ type: 'user.message', id: 'followup', source: 'user', text: 'Continue', blocks: [{ type: 'text', text: 'Continue' }] }], live)).todos, firstTodos, 'a follow-up preserves unfinished work')
assert.deepEqual(wire(todoLive.apply([{ type: 'todo.write', items: [] }], live)).todos, [], 'native clear stays empty')
assert.deepEqual(createWebSessionView({ ...session, ref: { backendId: 'test', sessionId: 'other-session' } }).snapshot().todos, [], 'a different session starts without stale todos')
console.log('Web task projection OK (native updates, task boundary, replay, clear and session isolation)')

let pressure = { projectedTokens: 1234, contextWindow: 8000 };
const contextView = createWebSessionView({ ...session, capabilities: { compact: { run: async () => ({ compacted: false }) }, native: { dsh: { rawHistory: () => [], contextPressure: () => pressure } } } });
contextView.apply([message, { ...message, seq: 99, attemptId: 'third' }], live);
assert.equal(contextView.snapshot().context.occupancy.usedTokens, 1234, 'official projection outranks lifetime spending');
assert.equal(contextView.snapshot().context.occupancy.source, 'projection');
pressure = { projectedTokens: 345, contextWindow: 8000 };
assert.equal(contextView.apply([], live).context.occupancy.usedTokens, 345, 'projection-only changes refresh without a model message');
assert.ok(contextView.snapshot().commands.some(command => command.name === 'compact'));
contextView.apply([{ type: 'compaction.start', trigger: 'manual', cancellable: false, time: 10 }, { type: 'compaction.progress', outputChars: 40 }], live);
assert.equal(contextView.snapshot().context.compaction.outputChars, 40);
contextView.apply([{ type: 'compaction.end', ok: true, time: 20 }], live);
assert.equal(contextView.snapshot().context.compaction, undefined);
assert.equal(createWebSessionView(session).snapshot().context.occupancy, undefined, 'missing measurements remain unknown');
assert.ok(!createWebSessionView(session).snapshot().commands.some(command => command.name === 'compact'));
console.log('Web context projection OK (native occupancy precedence, projection-only updates, compaction lifecycle and unsupported actions)');
