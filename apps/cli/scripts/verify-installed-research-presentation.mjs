/** Offline saved-research tools from an independently extracted CLI package. */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packFlagqai } from './pack-flagqai.mjs'

const root = await mkdtemp(join(tmpdir(), 'flagqai-installed-research-presentation-'))
try {
  const archive = await packFlagqai({ destination: root })
  const relocated = join(root, 'relocated')
  await mkdir(relocated)
  execFileSync('tar', ['-xzf', archive.path, '-C', relocated])
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import { createWorkbenchTools } from './package/lib/types/dsh-adapter/workbench-tools.js'
    globalThis.fetch = () => { throw Error('Network forbidden in offline acceptance') }
    const id = 'invsqrt-' + 'a'.repeat(32)
    const binding = { port: 1, client: 'client', session: 'session' }, calls = []
    const record = { id, status: 'failed', source_sha256: 'f'.repeat(64), error: 'Saved failure',
      project: { id: 'study', baseline: { revision: 2, current: null, history: [{}, {}] } },
      comparison: { columns: ['Baseline', 'Candidate'], rows: [{ label: 'Resource cost', values: [200, 180] }] },
      exports: [], evidence: { large: 'x'.repeat(50000) } }
    const tools = createWorkbenchTools(() => binding, '/workspace', async (url, init) => {
      if (url.endsWith('/api/agent')) return new Response(JSON.stringify({ cwd: '/workspace' }))
      const body = JSON.parse(init.body); calls.push(body)
      return new Response(JSON.stringify(body.operation === 'research.read' ? record : { research_run: { id }, page: 'jobs' }))
    })
    const call = (name, input) => tools.find(tool => tool.name === name).execute(input, { signal: new AbortController().signal })
    const summary = await call('workbench_inspect', { resource: 'research_run', id })
    assert.equal(summary.status, 'failed'); assert.equal(summary.error, 'Saved failure')
    assert.equal(summary.source_sha256, record.source_sha256); assert.equal(summary.evidence, undefined)
    assert.deepEqual(summary.comparison, record.comparison); assert.equal(summary.project.baseline.history_count, 2)
    assert.deepEqual(await call('workbench_inspect', { resource: 'research_run', id, detail: 'full' }), record)
    await call('workbench_present_research_run', { run_id: id, request_id: 'stable-presentation' })
    assert.equal(calls.at(-1).request_id, 'stable-presentation')
    assert.deepEqual(calls.map(call => call.operation), ['research.read', 'research.read', 'research.present'])
    let shared = false
    const currentCalls = []
    const current = createWorkbenchTools(() => binding, '/workspace', async (url, init) => {
      if (url.endsWith('/api/agent')) return new Response(JSON.stringify({ cwd: '/workspace' }))
      const body = JSON.parse(init.body); currentCalls.push(body.operation)
      const value = body.operation === 'status' ? (shared ? { editorFile: 'exact.py' } : {})
        : body.operation === 'model.read' ? { id: body.model_id, source: 'saved source' }
        : { source: 'unsaved draft', source_hash: 'draft-hash' }
      return new Response(JSON.stringify(value))
    }).find(tool => tool.name === 'workbench_inspect')
    const inspect = () => current.execute({ resource: 'model' }, { signal: new AbortController().signal })
    const draft = await inspect()
    assert.equal(draft.kind, 'browser_draft'); assert.equal(draft.source, 'unsaved draft')
    shared = true
    assert.equal((await inspect()).id, 'exact.py')
    assert.deepEqual(currentCalls, ['status', 'draft.read', 'status', 'model.read'])
    const digest = 'b'.repeat(64)
    const delivery = createWorkbenchTools(() => binding, '/workspace', async (url, init) => {
      if (url.endsWith('/api/agent')) return new Response(JSON.stringify({ cwd: '/workspace' }))
      const body = JSON.parse(init.body)
      assert.equal(body.operation, 'research.export')
      assert.deepEqual(body.run_ids, ['saved-run'])
      assert.equal(body.request_id, 'same-package')
      return new Response(JSON.stringify({ export: { id: digest, sha256: digest, bytes: 100 } }))
    }).find(tool => tool.name === 'workbench_export_research')
    const exported = await delivery.execute({ run_ids: ['saved-run'], goal: 'QAOA', request_id: 'same-package' }, { signal: new AbortController().signal })
    assert.equal(exported.download_url, 'http://127.0.0.1:1/api/research/exports/' + digest + '/file')
    await call('workbench_inspect_research', {})
    assert.equal(calls.at(-1).operation, 'research.candidate.inspect')
    await call('workbench_propose_research_candidate', {
      parent: id, parent_sha256: 'f'.repeat(64), expected_project_revision: 2,
      before: 'X q0', after: 'Z q0', reason: 'Compare one gate', request_id: 'stable-proposal'
    })
    assert.equal(calls.at(-1).operation, 'research.propose')
    assert.equal(calls.at(-1).request_id, 'stable-proposal')
    assert.equal(calls.some(call => /verify|adopt|execute/.test(call.operation)), false)
    console.log('Relocated research tools: saved status, metrics, versions, compact/full reads and explicit presentation passed.')
  `], { cwd: relocated, stdio: 'inherit', timeout: 60000 })
} finally {
  await rm(root, { recursive: true, force: true })
}
