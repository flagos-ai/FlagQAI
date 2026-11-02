import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkbenchTools, workbenchBinding } from '../lib/types/dsh-adapter/workbench-tools.js'
import { withTaskProgressPolicy } from '../lib/types/dsh-adapter/task-progress-policy.js'
import { experimentEvidence, runEvidence } from '../lib/types/dsh-adapter/workbench-evidence.js'

const binding = { port: 4188, client: 'client-1', session: 'session-1' }
function message(command = ['python3', 'packages/quantum-workspace/workbench.py', '--port', '4188', '--client', 'client-1', '--session', 'session-1']) {
  return 'Run my experiment.\n\n<workspace_controls>\n' + JSON.stringify({ schema: 'flagqai.workspace-controls.v1', command }) + '\n</workspace_controls>'
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
test('completion policy exists only for workbench sessions and is not duplicated', () => {
  const plain = { sections: [], tools: [], contexts: [], variables: {} }
  assert.equal(withTaskProgressPolicy(plain), plain)
  const web = { ...plain, tools: [{ name: 'workbench_run_python' }] }
  const guided = withTaskProgressPolicy(web)
  assert.equal(guided.sections.length, 1)
  assert.match(guided.sections[0].text, /workbench_present_experiment/)
  assert.equal(withTaskProgressPolicy(guided), guided)
  assert.equal(withTaskProgressPolicy({ ...guided, tools: [] }).sections.length, 0)
})
function fixture(handler = () => response({})) {
  const calls = []
  const tools = createWorkbenchTools(() => binding, '/workspace', async (url, init) => {
    calls.push({ url, init })
    return url.endsWith('/api/agent') ? response({ cwd: '/workspace' }) : handler(JSON.parse(init.body))
  })
  const run = (name, args) => tools.find(t => t.name === name).execute(args, { signal: new AbortController().signal })
  return { calls, run }
}
test('only an exact Web controls suffix for this native session can bind tools', () => {
  assert.deepEqual(workbenchBinding(message(), 'session-1'), binding)
  assert.deepEqual(workbenchBinding(message(['python3', '/checkout/packages/quantum-workspace/workbench.py', '--port', '4188', '--client', 'client-1', '--session', 'session-1']), 'session-1'), binding)
  assert.equal(workbenchBinding(message(), 'other-session'), undefined)
  assert.equal(workbenchBinding(message() + '\nextra', 'session-1'), undefined)
  assert.equal(workbenchBinding('normal CLI message', 'session-1'), undefined)
  for (const [index, value] of [[0, 'sh'], [1, 'arbitrary.py'], [3, '99999'], [5, '../escape']]) {
    const command = ['python3', 'packages/quantum-workspace/workbench.py', '--port', '4188', '--client', 'client-1', '--session', 'session-1']
    command[index] = value
    assert.equal(workbenchBinding(message(command), 'session-1'), undefined)
  }
})
test('a foreign workspace cannot receive a mutation; cancellation and redirects remain constrained', async () => {
  let requests = 0
  const controller = new AbortController()
  const tools = createWorkbenchTools(() => binding, '/workspace', async (_url, init) => {
    requests++
    assert.equal(init.redirect, 'error')
    assert.equal(init.signal, controller.signal)
    return response({ cwd: '/other' })
  })
  await assert.rejects(tools[1].execute({ source: 'code', name: 'Bell', request_id: 'stable' }, { signal: controller.signal }), /different native workspace/)
  assert.equal(requests, 1)
})
test('run preserves the inspected revision and retry identity without automatic retries', async () => {
  const { run, calls } = fixture(() => response({ error: 'Revision changed' }, 409))
  await assert.rejects(run('workbench_run_python', { model_id: 'bell.py', revision: 'old', request_id: 'stable' }), /Revision changed/)
  assert.equal(calls.length, 2)
  assert.deepEqual(JSON.parse(calls[1].init.body), { model_id: 'bell.py', expected_revision: 'old', request_id: 'stable', ...binding, operation: 'python.run' })
})
test('presentation verifies the archive before issuing focus and refuses a missing result', async () => {
  const rejected = fixture(() => response({ id: 'fqx-one', program: { id: 'fqx-one' } }))
  await assert.rejects(rejected.run('workbench_present_experiment', { experiment_id: 'fqx-one', view: 'result', request_id: 'show' }), /no saved result/)
  assert.equal(rejected.calls.filter(c => c.url.endsWith('/actions')).length, 1)
  const good = fixture(body => response(body.operation === 'experiment.read' ? { id: 'fqx-one', program: { id: 'fqx-one' }, job: { id: 'fqx-one' } } : { page: 'jobs' }))
  await good.run('workbench_present_experiment', { experiment_id: 'fqx-one', view: 'result', request_id: 'show' })
  const actions = good.calls.filter(c => c.url.endsWith('/actions')).map(c => JSON.parse(c.init.body))
  assert.deepEqual(actions.map(a => a.operation), ['experiment.read', 'focus'])
  assert.equal(actions[1].job_id, 'fqx-one')
  assert.equal(actions[1].page, 'jobs')
})
test('waiting observes collection, never resubmits, and reports a pending deadline honestly', async () => {
  let reads = 0
  const existing = fixture(body => {
    assert.equal(body.operation, 'python.read')
    assert.equal(body.run_id, 'same-run')
    return response({ id: 'same-run', status: 'completed', collection_status: ++reads === 1 ? 'collecting' : 'completed', experiments: [] })
  })
  const completed = await existing.run('workbench_wait_run', { run_id: 'same-run', timeout_ms: 2000 })
  assert.equal(completed.wait_outcome, 'settled')
  assert.equal(completed.settled, true)
  assert.equal(reads, 2)
  const pending = fixture(() => response({ id: 'same-run', status: 'running', collection_status: 'pending' }))
  const deadline = await pending.run('workbench_wait_run', { run_id: 'same-run', timeout_ms: 20 })
  assert.equal(deadline.wait_outcome, 'deadline')
  assert.equal(deadline.settled, false)
  assert.equal(deadline.status, 'running')
  assert.ok(pending.calls.every(c => !c.init.body || JSON.parse(c.init.body).operation === 'python.read'))
})
test('waiting stops promptly on caller cancellation and refuses out-of-range waits', async () => {
  const pending = fixture(() => response({ id: 'run', status: 'running', collection_status: 'pending' }))
  const controller = new AbortController(), reason = new Error('Operator stopped the Agent')
  const tools = createWorkbenchTools(() => binding, '/workspace', async url => response(url.endsWith('/api/agent') ? { cwd: '/workspace' } : { id: 'run', status: 'running' }))
  const promise = tools.find(t => t.name === 'workbench_wait_run').execute({ run_id: 'run' }, { signal: controller.signal })
  controller.abort(reason)
  await assert.rejects(promise)
  for (const timeout_ms of [0, 10001, 1.5])
    await assert.rejects(pending.run('workbench_wait_run', { run_id: 'run', timeout_ms }), /between 1 and 10000/)
  assert.equal(pending.calls.length, 0)
})
test('compact evidence retains errors, batched counts, identity and explicit truncation without fabricating missing results', async () => {
  const run = runEvidence({ id: 'failed', source: 'x'.repeat(20000), source_hash: 'version', status: 'failed', collection_status: 'failed', logs: [{ stream: 'stderr', text: 'x'.repeat(9000) + 'AttributeError: missing gate' }] })
  assert.equal(run.source, undefined)
  assert.equal(run.source_hash, 'version')
  assert.equal(run.logs_truncated, true)
  assert.ok(run.logs[0].text.endsWith('AttributeError: missing gate'))
  assert.equal(run.logs[0].text.length, 8000)
  const rows = Array.from({ length: 80 }, (_, n) => ({ state: String(n), key_type: 'integer', count: 2 }))
  const archive = { id: 'fqx-batched', program: { id: 'fqx-batched', origin: { run_id: 'run', source_hash: 'hash' }, compiled: { instructions: Array(130).fill({ name: 'h' }) }, experiment: { filename: 'named.fqx', sha256: 'archive-hash', measurements: [{ kind: 'counts', qubits: [0, 1], shots: 160, batches: [rows, rows] }], state: { shape: [40], values: Array(40).fill([1, 0]), truncated: false } } }, job: { status: 'completed' } }
  const summary = experimentEvidence(archive, 4188)
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary)
  assert.equal(summary.archive.filename, 'named.fqx')
  assert.match(summary.archive.download_url, /fqx-batched\/file$/)
  assert.equal(summary.origin.source_hash, 'hash')
  assert.equal(summary.circuit.instructions_truncated, true)
  assert.equal(summary.measurements[0].batches.length, 2)
  assert.equal(summary.measurements[0].batches[0].total_counts, 160)
  assert.equal(summary.measurements[0].batches[0].rows.length, 64)
  assert.equal(summary.measurements[0].batches[0].truncated, true)
  assert.equal(summary.recorded_state.truncated, true)
  const full = fixture(() => response(archive))
  assert.deepEqual(await full.run('workbench_inspect', { resource: 'experiment', id: 'fqx-batched', detail: 'full' }), archive)
  assert.equal(experimentEvidence({ id: 'fqx-program', program: {} }, 4188).has_result, false)
  const programOnly = experimentEvidence({ id: 'fqx-program', program: {} }, 4188)
  assert.deepEqual(JSON.parse(JSON.stringify(programOnly)), programOnly)
})
test('a changed binding cannot redirect an accepted read or issue a focus mutation', async () => {
  let active = binding, writes = 0
  const tools = createWorkbenchTools(() => active, '/workspace', async url => {
    if (url.endsWith('/api/agent')) { active = { ...binding, client: 'other-client' }; return response({ cwd: '/workspace' }) }
    writes++; return response({})
  })
  await assert.rejects(tools[0].execute({ resource: 'workspace' }, { signal: new AbortController().signal }), /context changed/)
  assert.equal(writes, 0)
})
test('new code and comparison go through scoped actions without overwriting the current model', async () => {
  const { run, calls } = fixture()
  await run('workbench_create_python', { source: 'print(1)', name: 'New experiment', request_id: 'new' })
  await run('workbench_compare_experiments', { baseline_id: 'fqx-a', variant_id: 'fqx-b', request_id: 'pair' })
  const bodies = calls.filter(c => c.url.endsWith('/actions')).map(c => JSON.parse(c.init.body))
  assert.equal(bodies[0].operation, 'model.create')
  assert.equal(bodies[0].language, 'python')
  assert.equal(bodies[0].model_id, undefined)
  assert.equal(bodies[1].operation, 'experiment.compare')
})
