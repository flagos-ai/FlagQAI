import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const moduleUrl = process.env.FLAGQAI_COORDINATION_TEST_PACKAGE_ROOT
  ? pathToFileURL(join(process.env.FLAGQAI_COORDINATION_TEST_PACKAGE_ROOT, 'lib/flagqai-platform/harness-adapter/project-coordination.mjs'))
  : new URL('../../../packages/harness-adapter/project-coordination.mjs', import.meta.url);
const { createProjectCoordinator } = await import(moduleUrl.href);

function fixture(start) {
  const state = { coordinator_session_id: 'owner', constraint_revision: 1, tasks: {
    width: { id: 'width', worker_session_id: 'child', status: 'reserved', task: 'Reduce width',
      constraints: 'Keep baseline', constraint_revision: 1, source_sha256: 'frozen-code' },
  } };
  let starts = 0;
  let claims = 0;
  const native = { sessionId: 'owner', signal: new AbortController().signal, available: () => true,
    start: async (...args) => { starts++; return start(...args); },
    observe: async () => ({ status: 'unknown', revision: 'no-native-receipt' }),
    onError(error) { throw error; } };
  async function action(_operation, input) {
    if (input.action === 'claim') {
      claims++;
      const claimed = state.tasks.width.status === 'reserved';
      if (claimed) state.tasks.width.status = 'admitting';
      return { coordination: structuredClone(state), claimed };
    }
    if (input.action === 'observe') state.tasks.width.status = input.status;
    return { coordination: structuredClone(state) };
  }
  return { native, state, action, counts: () => ({ starts, claims }) };
}
const signal = () => new AbortController().signal;
test('an uncertain native admission survives reconstruction without automatic retry', async () => {
  const f = fixture(async () => { throw new Error('Lost native admission response'); });
  await assert.rejects(createProjectCoordinator(f.native).control({ action: 'dispatch', task_id: 'width' }, f.action, signal()), /Lost native/);
  const restored = createProjectCoordinator(f.native);
  await restored.control({ action: 'dispatch', task_id: 'width' }, f.action, signal());
  await restored.control({ action: 'recover' }, f.action, signal());
  assert.equal(f.counts().starts, 1);
  assert.equal(f.state.tasks.width.status, 'unknown');
});
test('concurrent dispatch shares one native admission and recovery only observes', async () => {
  const result = Promise.withResolvers();
  const f = fixture(async id => ({ childId: id, result: result.promise }));
  const coordinator = createProjectCoordinator(f.native);
  await Promise.all([1, 2].map(() => coordinator.control({ action: 'dispatch', task_id: 'width' }, f.action, signal())));
  assert.equal(f.counts().starts, 1);
  result.resolve({ stopReason: 'completed' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.tasks.width.status, 'completed');
});
test('foreign ownership and missing native capabilities reject before admission', async () => {
  const f = fixture(async () => { throw new Error('Must not start'); });
  f.native.available = () => false;
  await assert.rejects(createProjectCoordinator(f.native).control({ action: 'dispatch', task_id: 'width' }, f.action, signal()), /unavailable/);
  f.native.available = () => true;
  f.state.coordinator_session_id = 'another-owner';
  await assert.rejects(createProjectCoordinator(f.native).control({ action: 'recover' }, f.action, signal()), /another native session/);
  assert.deepEqual(f.counts(), { starts: 0, claims: 0 });
});

test('independent worker tasks keep their own code and constraints in native requests', async () => {
  const starts = [];
  const results = [];
  const f = fixture(async (id, label, prompt) => {
    starts.push({ id, label, prompt: JSON.parse(prompt) });
    const result = Promise.withResolvers(); results.push(result);
    return { childId: id, result: result.promise };
  });
  const first = { ...f.state.tasks.width, source_sha256: 'archived-width-code', parent_run_id: 'width-run', verifier_sha256: 'archived-verifier' };
  f.state.tasks.width = first;
  f.state.tasks.cost = { ...first, id: 'cost', worker_session_id: 'cost-child', task: 'Reduce cost', source_sha256: 'archived-cost-code', parent_run_id: 'cost-run' };
  const action = async (_op, input) => {
    const task = f.state.tasks[input.task_id];
    if (input.action === 'claim') {
      const claimed = task.status === 'reserved';
      if (claimed) task.status = 'admitting';
      return { claimed, coordination: structuredClone(f.state) };
    }
    if (input.action === 'observe') task.status = input.status;
    return { coordination: structuredClone(f.state) };
  };
  const coordinator = createProjectCoordinator(f.native);
  await Promise.all(['width', 'cost'].map(task_id => coordinator.control({ action: 'dispatch', task_id }, action, signal())));
  assert.deepEqual(starts.map(item => item.id).sort(), ['child', 'cost-child']);
  for (const start of starts) {
    assert.equal(start.prompt.source_sha256, f.state.tasks[start.label].source_sha256);
    assert.equal(start.prompt.constraints, 'Keep baseline');
    assert.equal(start.prompt.constraint_revision, 1);
    assert.equal(start.prompt.verifier_sha256, 'archived-verifier');
    assert.match(start.prompt.instruction, /archived verifier report/);
  }
  results.forEach(result => result.resolve({ stopReason: 'completed' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(Object.values(f.state.tasks).every(task => task.status === 'completed'));
});
test('cancellation after a durable claim prevents admission and cannot reopen the task', async () => {
  const f = fixture(async () => { throw new Error('Must not start'); });
  const controller = new AbortController();
  const action = async (op, input) => {
    const result = await f.action(op, input);
    if (input.action === 'claim') controller.abort(new Error('Cancelled after claim'));
    return result;
  };
  await assert.rejects(createProjectCoordinator(f.native).control({ action: 'dispatch', task_id: 'width' }, action, controller.signal), /Cancelled after claim/);
  assert.equal(f.counts().starts, 0);
  await createProjectCoordinator(f.native).control({ action: 'dispatch', task_id: 'width' }, f.action, signal());
  assert.equal(f.counts().starts, 0);
  assert.equal(f.state.tasks.width.status, 'admitting');
});
test('native identity mismatch is an uncertain admission, never an automatic retry', async () => {
  const f = fixture(async () => ({ childId: 'other-child', result: new Promise(() => {}) }));
  await assert.rejects(createProjectCoordinator(f.native).control({ action: 'dispatch', task_id: 'width' }, f.action, signal()), /identity mismatch/);
  await createProjectCoordinator(f.native).control({ action: 'dispatch', task_id: 'width' }, f.action, signal());
  assert.equal(f.counts().starts, 1);
});
test('recovery skips reserved work, reuses observation receipts and never starts a worker', async () => {
  const f = fixture(async () => { throw new Error('Must not start'); });
  const observed = [];
  f.native.observe = async id => { observed.push(id); return { status: 'failed', revision: 'saved-turn-17', detail: 'Preserve the failure' }; };
  const requests = [];
  const action = async (op, input) => { requests.push(input); return f.action(op, input); };
  const coordinator = createProjectCoordinator(f.native);
  await coordinator.control({ action: 'recover' }, action, signal());
  assert.deepEqual(observed, []);
  f.state.tasks.width.status = 'unknown';
  await coordinator.control({ action: 'recover' }, action, signal());
  await createProjectCoordinator(f.native).control({ action: 'recover' }, action, signal());
  assert.deepEqual(observed, ['child', 'child']);
  const observations = requests.filter(input => input.action === 'observe');
  assert.equal(observations.length, 2);
  assert.equal(observations[0].request_id, observations[1].request_id);
  assert.equal(observations[0].detail, 'Preserve the failure');
  assert.deepEqual(f.counts(), { starts: 0, claims: 0 });
});

test('lost running receipt still observes completion without admitting a second worker', async () => {
  const result = Promise.withResolvers();
  const f = fixture(async id => ({ childId: id, result: result.promise }));
  const action = async (op, input) => {
    if (input.request_id?.startsWith('accepted-')) throw new Error('Lost running receipt');
    return f.action(op, input);
  };
  await assert.rejects(createProjectCoordinator(f.native).control({ action: 'dispatch', task_id: 'width' }, action, signal()), /Lost running receipt/);
  result.resolve({ stopReason: 'completed' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.tasks.width.status, 'completed');
  await createProjectCoordinator(f.native).control({ action: 'dispatch', task_id: 'width' }, f.action, signal());
  assert.equal(f.counts().starts, 1);
});
