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
test('current model inspection reads the draft or exact shared id without guessing or mutating', async () => {
  const draft = fixture(body => response(body.operation === 'status' ? {} : { name: 'Unsaved arithmetic', source: 'draft code', source_hash: 'draft-hash' }))
  const result = await draft.run('workbench_inspect', { resource: 'model' })
  assert.equal(result.kind, 'browser_draft')
  assert.equal(result.source, 'draft code')
  assert.equal(result.id, undefined)
  assert.deepEqual(draft.calls.filter(c => c.init.body).map(c => JSON.parse(c.init.body).operation), ['status', 'draft.read'])
  const shared = fixture(body => response(body.operation === 'status' ? { editorFile: 'exact-id.py' } : { id: body.model_id, source: 'saved code', revision: 'version' }))
  assert.equal((await shared.run('workbench_inspect', { resource: 'model' })).id, 'exact-id.py')
  assert.deepEqual(shared.calls.filter(c => c.init.body).map(c => JSON.parse(c.init.body).operation), ['status', 'model.read'])
})
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

test('SDK inspection uses only the read-only workbench operation for the bound session', async () => {
  const apis = { 'fq.run': { signature: '(program)' } }
  const f = fixture(() => response({ apis }))
  assert.deepEqual(await f.run('workbench_inspect', { resource: 'sdk' }), { apis })
  const requests = f.calls.filter(call => call.url.endsWith('/actions'))
  assert.deepEqual(requests.map(call => JSON.parse(call.init.body)), [{ ...binding, operation: 'sdk.inspect' }])
})

test('research inspection and team control remain workspace/session scoped', async () => {
  const calls = []
  let active = binding
  const coordinator = { control: async (input, action, signal) => action('research.coordinate', input, signal) }
  const tools = createWorkbenchTools(() => active, '/workspace', async (url, init) => {
    if (url.endsWith('/api/agent')) return response({ cwd: '/workspace' })
    const data = JSON.parse(init.body); calls.push(data)
    return response({ parent: data.parent, coordination: { coordinator_session_id: data.session } })
  }, coordinator)
  const inspect = tools.find(tool => tool.name === 'workbench_inspect')
  const team = tools.find(tool => tool.name === 'workbench_research_team')
  const signal = new AbortController().signal
  await inspect.execute({ resource: 'research', id: 'invsqrt-source' }, { signal })
  assert.equal(calls[0].operation, 'research.inspect')
  assert.equal(calls[0].parent, 'invsqrt-source')
  await team.execute({ action: 'inspect' }, { signal })
  assert.equal(calls[1].session, binding.session)
  assert.equal(calls[1].client, binding.client)
  assert.equal(calls[1].operation, 'research.coordinate')
  assert.ok(!team.parameters.properties.action.enum.includes('claim'))
  assert.ok(!team.parameters.properties.action.enum.includes('observe'))
  active = undefined
  await assert.rejects(team.execute({ action: 'inspect' }, { signal }), /Open the Web workbench/)
  assert.equal(calls.length, 2)
})

test('research read and presentation retain recorded status, source version and retry identity', async () => {
  const id = 'invsqrt-' + 'a'.repeat(32)
  const run = { id, status: 'failed', source_sha256: 'f'.repeat(64), error: 'Recorded verifier failure',
    comparison: { columns: ['Baseline', 'Candidate'], rows: [{ label: 'Resource cost', values: [200, 180] }] },
    project: { id: 'study', name: 'Study', baseline: { revision: 2, current: { run_id: id }, history: [{}, {}] } },
    evidence: { unbounded: 'x'.repeat(100000) }, exports: [{ name: 'candidate.kmx', sha256: 'f'.repeat(64) }] }
  const { run: call, calls } = fixture(body => response(body.operation === 'research.read' ? run : { research_run: { id }, page: 'jobs' }))
  const summary = await call('workbench_inspect', { resource: 'research_run', id })
  assert.equal(summary.status, 'failed')
  assert.equal(summary.error, 'Recorded verifier failure')
  assert.equal(summary.source_sha256, run.source_sha256)
  assert.deepEqual(summary.comparison, run.comparison)
  assert.equal(summary.project.baseline.history_count, 2)
  assert.equal(summary.evidence, undefined)
  assert.match(summary.full_record, /detail="full"/)
  const full = await call('workbench_inspect', { resource: 'research_run', id, detail: 'full' })
  assert.deepEqual(full, run)
  await call('workbench_present_research_run', { run_id: id, request_id: 'same-presentation' })
  const body = JSON.parse(calls.at(-1).init.body)
  assert.deepEqual(body, { run_id: id, request_id: 'same-presentation', ...binding, operation: 'research.present' })
  assert.ok(!calls.some(item => item.init.body && /research\.(verify|propose|adopt)/.test(JSON.parse(item.init.body).operation)))
})

test('research summaries bound long text and omit baseline report bodies explicitly', async () => {
  const id = 'invsqrt-' + 'a'.repeat(32)
  const record = { id, error: 'x'.repeat(5000), project: { baseline: { current: { run_id: id, metrics: { large: 'x'.repeat(50000) } } } } }
  const { run } = fixture(() => response(record))
  const summary = await run('workbench_inspect', { resource: 'research_run', id })
  assert.equal(summary.error.length, 4000)
  assert.equal(summary.text_truncated, true)
  assert.equal(summary.project.baseline.current.metrics, undefined)
  const full = await run('workbench_inspect', { resource: 'research_run', id, detail: 'full' })
  assert.equal(full.error.length, 5000)
  const mismatch = fixture(() => response({ id: 'another-record' }))
  await assert.rejects(mismatch.run('workbench_inspect', { resource: 'research_run', id, detail: 'full' }), /identity/)
  await assert.rejects(mismatch.run('workbench_present_research_run', { run_id: id, request_id: 'present' }), /identity/)
})

test('current model inspection stops when the active session changes after status', async () => {
  let active = binding
  const operations = []
  const tools = createWorkbenchTools(() => active, '/workspace', async (url, init) => {
    if (url.endsWith('/api/agent')) return response({ cwd: '/workspace' })
    operations.push(JSON.parse(init.body).operation)
    active = { ...binding, session: 'changed' }
    return response({ editorFile: 'saved.py' })
  })
  await assert.rejects(tools.find(t => t.name === 'workbench_inspect').execute({ resource: 'model' }, { signal: new AbortController().signal }), /context changed/)
  assert.deepEqual(operations, ['status'])
  const explicit = fixture(body => response({ id: body.model_id, source: 'specific version' }))
  assert.equal((await explicit.run('workbench_inspect', { resource: 'model', id: 'chosen.py' })).id, 'chosen.py')
  assert.deepEqual(explicit.calls.filter(c => c.init.body).map(c => JSON.parse(c.init.body).operation), ['model.read'])
  await assert.rejects(explicit.run('workbench_inspect', { resource: 'run' }), /requires an id/)
})

test('research package export returns only a validated local download identity', async () => {
  const digest = 'a'.repeat(64)
  const f = fixture(() => response({ export: { id: digest, sha256: digest, bytes: 123 } }))
  const exported = await f.run('workbench_export_research', { run_ids: ['saved-run'], goal: 'QAOA', request_id: 'export-once' })
  assert.equal(exported.download_url, `http://127.0.0.1:4188/api/research/exports/${digest}/file`)
  assert.deepEqual(JSON.parse(f.calls.at(-1).init.body), { run_ids: ['saved-run'], goal: 'QAOA', request_id: 'export-once', ...binding, operation: 'research.export' })
  const invalid = fixture(() => response({ export: { id: '../unsafe' } }))
  await assert.rejects(invalid.run('workbench_export_research', {}), /invalid identity/)
})

test('preflight uses the selected SDK and a separate exact model revision with stable retry IDs', async () => {
  const f = fixture(body => response(body.operation === 'sdk.inspect' ? { apis: { 'fq.Module': {} } }
    : body.operation === 'model.create' ? { file: { id: 'smoke.py', revision: 'smoke-v1' } }
    : { python_run: { id: 'smoke-run', source_hash: 'smoke-v1', status: 'running' } }))
  const input = { source: 'assert forward_backward_step()', name: 'Training preflight', request_id: 'smoke' }
  for (let n = 0; n < 2; n++) {
    const result = await f.run('workbench_preflight_python', input)
    assert.equal(result.purpose, 'preflight')
    assert.equal(result.python_run.id, 'smoke-run')
    assert.equal(result.next_tool, 'workbench_wait_run')
  }
  const actions = f.calls.filter(c => c.init.body).map(c => JSON.parse(c.init.body))
  assert.deepEqual(actions.map(c => c.operation), ['sdk.inspect', 'model.create', 'python.run', 'sdk.inspect', 'model.create', 'python.run'])
  assert.equal(actions[1].request_id, 'smoke:model')
  assert.equal(actions[2].request_id, 'smoke:run')
  assert.equal(actions[2].expected_revision, 'smoke-v1')
  assert.deepEqual(actions.slice(0, 3), actions.slice(3))
  const bad = fixture(body => response(body.operation === 'sdk.inspect' ? {} : { file: { id: 'missing-revision.py' } }))
  await assert.rejects(bad.run('workbench_preflight_python', input), /no run was submitted/)
  assert.equal(bad.calls.filter(c => c.init.body).length, 2)
})

test('preflight cannot run after SDK inspection changes its session', async () => {
  let active = binding
  const calls = []
  const tools = createWorkbenchTools(() => active, '/workspace', async (url, init) => {
    if (url.endsWith('/api/agent')) return response({ cwd: '/workspace' })
    calls.push(JSON.parse(init.body).operation)
    active = { ...binding, session: 'new-session' }
    return response({})
  })
  await assert.rejects(tools.find(t => t.name === 'workbench_preflight_python').execute({ source: 'pass', name: 'Check', request_id: 'one' }, { signal: new AbortController().signal }), /context changed/)
  assert.deepEqual(calls, ['sdk.inspect'])
})

test('compact evidence keeps the explicit SDK cause even outside its recent log window', () => {
  const run = { status: 'failed', logs: [
    { stream: 'stderr', text: 'Traceback (most recent call last):\n  File "candidate.py", line 54, in builder\nKeyError: (0, 0)\n\nThe above exception was the direct cause of the following exception:\n\nTraceback (most recent call last):\n  File "candidate.py", line 130, in main\nflagquantum.errors.ExecutionError: Module builder compilation requires static circuit topology\n' },
    ...Array.from({ length: 25 }, () => ({ stream: 'stdout', text: 'later diagnostics\n' })),
  ] }
  const evidence = runEvidence(run)
  assert.equal(evidence.logs_truncated, true)
  assert.equal(evidence.failure.summary, 'KeyError: (0, 0)')
  assert.deepEqual(evidence.failure.frames, [{ file: 'candidate.py', line: 54 }])
  assert.equal(evidence.failure.explicit_cause, true)
  assert.equal(runEvidence({ status: 'completed', logs: run.logs }).failure, null)
  const unchained = runEvidence({ status: 'failed', logs: [{ stream: 'stderr', text: 'KeyError: old\nDuring handling of the above exception, another exception occurred:\nValueError: current\n' }] })
  assert.equal(unchained.failure.summary, 'ValueError: current')
})

test('saved metrics remain source-bound recorded evidence and never imply independent validation', () => {
  const metrics = { flagqai_hybrid_training: { trained: { initial_loss: 2.5, final_loss: 0.01 }, quantum_advantage_claim: false } }
  const evidence = experimentEvidence({ program: { origin: { run_id: 'training', source_hash: 'revision' }, experiment: { metrics } } }, 4188)
  assert.deepEqual(evidence.recorded_metrics, metrics)
  assert.equal(evidence.origin.source_hash, 'revision')
  assert.equal(evidence.metrics_status, 'recorded_not_independently_verified')
  assert.equal(experimentEvidence({ program: {} }, 4188).metrics_status, 'not_recorded')
  assert.equal(experimentEvidence({ program: { experiment: { metrics: { big: 'x'.repeat(13000) } } } }, 4188).recorded_metrics.truncated, true)
})
