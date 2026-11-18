import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeResearchCoordinator } from '../lib/types/dsh-adapter/project-coordination.js';

function fixture(events = [], count) {
  const task = { id: 'width', worker_session_id: 'child', status: 'unknown', task: 'Reduce width',
    constraints: 'Keep baseline', constraint_revision: 1, source_sha256: 'source', verifier_sha256: 'verifier' };
  const state = { coordinator_session_id: 'parent', tasks: { width: task } };
  const reads = [], observations = [], starts = [];
  let closed = 0, dispose;
  const header = { id: 'child', parentSession: 'parent' };
  const persistence = {
    stat: async () => ({ eventCount: count }),
    open: async () => ({ header, read: async (offset, length) => {
      reads.push([offset, length]); return { events: events.slice(offset, offset + length) };
    }, close: async () => { closed++; } }),
  };
  const services = { sessionPersistence: persistence, sessionQuery: {}, subagents: {
    listChildren: async () => [{ id: 'child' }],
    startActivation: async spec => { starts.push(spec); return { childId: spec.childId, result: new Promise(() => {}) }; },
  } };
  const ctx = { get: key => services[key], effect: callback => { dispose = callback(); },
    agents: { get: () => undefined }, logger: { warn: message => { throw new Error(message); } } };
  const parent = { id: 'parent' };
  const coordinator = createNativeResearchCoordinator(ctx, parent);
  const action = async (_op, input) => {
    if (input.action === 'claim') { task.status = 'admitting'; return { claimed: true }; }
    if (input.action === 'observe') observations.push(input);
    return { coordination: structuredClone(state) };
  };
  return { coordinator, action, services, header, ctx, parent, reads, starts, observations, task,
    closed: () => closed, dispose: () => dispose() };
}
const signal = () => new AbortController().signal;
test('native activation uses the public spawn and parent delivery contract', async () => {
  const f = fixture();
  f.task.status = 'reserved';
  await f.coordinator.control({ action: 'dispatch', task_id: 'width' }, f.action, signal());
  assert.equal(f.starts.length, 1);
  const spec = f.starts[0];
  assert.equal(spec.provider, 'spawn');
  assert.equal(spec.delivery, 'parent');
  assert.equal(spec.childId, 'child');
  assert.equal(spec.request.parent, f.parent);
  assert.equal(JSON.parse(spec.request.prompt[0].text).verifier_sha256, 'verifier');
});
test('JSONL recovery probes an unknown event count and closes the read handle', async () => {
  const events = Array.from({ length: 257 }, () => ({ type: 'message' }));
  events[256] = { type: 'turn/end', data: { reason: { kind: 'completed' } } };
  const f = fixture(events);
  await f.coordinator.control({ action: 'recover' }, f.action, signal());
  assert.equal(f.starts.length, 0);
  assert.equal(f.observations[0].status, 'completed');
  assert.equal(f.observations[0].revision, '257');
  assert.ok(f.reads.length < 25);
  assert.deepEqual(f.reads.at(-1), [57, 200]);
  assert.equal(f.closed(), 1);
});
test('foreign persisted child is rejected and closed before projecting an outcome', async () => {
  const f = fixture([{ type: 'turn/end', data: { reason: { kind: 'completed' } } }], 1);
  f.header.parentSession = 'other-parent';
  await assert.rejects(f.coordinator.control({ action: 'recover' }, f.action, signal()), /does not belong/);
  assert.equal(f.closed(), 1);
  assert.equal(f.observations.length, 0);
});
test('missing admission and incomplete turns remain observable without execution', async () => {
  const f = fixture([{ type: 'turn/start' }], 1);
  await f.coordinator.control({ action: 'recover' }, f.action, signal());
  assert.equal(f.observations[0].status, 'interrupted');
  f.services.subagents.listChildren = async () => [];
  await f.coordinator.control({ action: 'recover' }, f.action, signal());
  assert.equal(f.observations[1].status, 'unknown');
  assert.equal(f.starts.length, 0);
});
test('live native workers are observed without reading or rerunning their transcript', async () => {
  const f = fixture();
  f.ctx.agents.get = () => ({ status: 'running', session: { seq: 7 } });
  await f.coordinator.control({ action: 'recover' }, f.action, signal());
  assert.equal(f.observations[0].status, 'running');
  assert.equal(f.reads.length, 0);
  assert.equal(f.starts.length, 0);
});
