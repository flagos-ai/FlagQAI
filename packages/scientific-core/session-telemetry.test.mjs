import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionTelemetry } from './session-telemetry.mjs';

test('a model-written tool claim cannot create platform telemetry', () => {
  const trace = sessionTelemetry([{ type: 'assistant.message', text: 'I used FlagQuantum five times.' }], 'run-a');
  assert.equal(trace.counts.toolCalls, 0);
  assert.deepEqual(trace.events, []);
});

test('durable tool counts use one redacted schema across backends', () => {
  const trace = sessionTelemetry([
    { type: 'turn.start', turn: 1, time: 1000 },
    { type: 'tool.call', callId: 'a', name: 'mcp__flagquantum__simulate_circuit_tool', time: 1100, argsJson: 'private' },
    { type: 'tool.result', callId: 'a', time: 1400, isError: false, text: 'sensitive' },
    { type: 'tool.call', callId: 'b', name: 'bash', time: 1500 },
    { type: 'tool.result', callId: 'b', time: 1600, isError: true, errorText: 'secret' },
    { type: 'tool.call', callId: 'c', name: 'write', time: 1700 },
    { type: 'permission.request', request: { requestId: 'p', command: 'sensitive' } },
    { type: 'permission.settled', requestId: 'p', outcome: 'allow-once' },
    { type: 'turn.end', turn: 1, reason: { kind: 'error', message: 'private backend detail' }, time: 1800 },
  ], 'run-b');
  assert.deepEqual(trace.counts, { toolCalls: 3, toolReturned: 1, toolFailed: 1, toolPending: 1,
    permissionDecisions: null, scientificInterventions: null });
  assert.equal(trace.events.find(row => row.callId === 'a' && row.eventType === 'tool_result').durationSeconds, 0.3);
  assert.equal(trace.events[1].time, '1970-01-01T00:00:01.100Z');
  assert.equal(trace.timestampsComplete, true, 'live-only permission events must not become fabricated durable history');
  assert.equal(trace.events.some(row => row.eventType.startsWith('permission_')), false);
  assert.equal(JSON.stringify(trace).includes('private'), false);
  assert.equal(JSON.stringify(trace).includes('sensitive'), false);
  assert.equal(JSON.stringify(trace).includes('secret'), false);
  assert.equal(JSON.stringify(trace).includes('private backend detail'), false);
  assert.equal(trace.events.at(-1).reason, 'error');
  assert.equal(trace.scientificResultValidated, null);
});

test('missing and regressing clocks are reported without invented durations', () => {
  const trace = sessionTelemetry([
    { type: 'tool.call', callId: 'a', name: 'bash', time: 2000 },
    { type: 'tool.result', callId: 'a', time: 1000, isError: false },
    { type: 'tool.call', callId: 'b', name: 'read' },
    { type: 'tool.result', callId: 'b', time: 3000, isError: false },
  ], 'run-c');
  assert.equal(trace.clockOrderValid, false);
  assert.equal(trace.timestampsComplete, false);
  assert.deepEqual(trace.events.filter(row => row.eventType === 'tool_result').map(row => row.durationSeconds), [null, null]);
  assert.deepEqual(trace.events.map(row => row.eventId), [1, 2, 3, 4]);
});

test('out-of-range timestamps do not crash telemetry projection', () => {
  const trace = sessionTelemetry([{ type: 'turn.start', turn: 1, time: 1e20 }], 'run-d');
  assert.equal(trace.timestampsComplete, false);
  assert.equal(trace.events[0].time, null);
});

test('journal decisions are redacted, stable across resource IDs, and never timed by inference', () => {
  const evidence = { sessionKey: 'stable-hash', complete: true,
    decisions: [{ outcome: 'allow-once' }, { outcome: 'rejected' }] };
  const first = sessionTelemetry([{ type: 'turn.start', turn: 1, time: 1000 }], 'resource-a', evidence);
  const resumed = sessionTelemetry([{ type: 'turn.start', turn: 1, time: 1000 }], 'resource-b', evidence);
  assert.equal(first.permissionSessionKey, resumed.permissionSessionKey);
  assert.equal(first.counts.permissionDecisions, 2);
  assert.equal(first.counts.scientificInterventions, null);
  assert.equal(first.timestampsComplete, true, 'backend event clocks stay separate from untimed permission outcomes');
  assert.deepEqual(first.permissionOutcomes, ['allow-once', 'rejected']);
  assert.deepEqual(first.events.map(row => row.eventId), [1]);
  assert.equal(sessionTelemetry([], 'resource-c', { ...evidence, complete: false }).counts.permissionDecisions, null);
});
