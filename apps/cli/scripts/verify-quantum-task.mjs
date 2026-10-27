/** Packaged CLI integration. Scripted model/MCP fixtures; no live-model claim.
 * --model-switch checks a native model fork and retained history using the scripted model.
 * Build first. --real-mcp replaces only the MCP fixture with pinned FlagQuantum.
 * --clean-install installs the tarball and pinned Harness with npm in a fresh HOME.
 * --without-presentation removes the inherited compiled TUI tree from the
 * acceptance archive before running the scripted Harness task. With a linked
 * host this verifies runtime isolation, not a fresh dependency installation.
 * --fresh-profile-install uses the official dsh plugin installer to install
 * the tarball in an isolated profile on an explicit Harness host.
 * FLAGQAI_ACCEPTANCE_PTY_MODULE adds a real installed-CLI terminal probe
 * after the clean-profile API checks (the PTY provider wizard writes credentials).
 * --interactions checks native approval and cancellation through the installed API.
 * --vqe uses the real pinned MCP and a scripted model to train the retrospective
 * two-qubit Hamiltonian, then checks energy and variance independently.
 * --research-vqe exercises the six-tool research contract with a real pinned
 * MCP, scripted model, recorded validators, and an independent numerical check.
 * Other modes: dependency links reuse the installed tree; this is relocation, not an npm-install test.
 * FLAGQAI_ACCEPTANCE_UPSTREAM_VERSION permits an explicit alternate Harness
 * host for compatibility probes without changing the managed install pin.
 * FLAGQAI_ACCEPTANCE_NPM_CACHE can reuse an explicit npm download cache while
 * every installation target, HOME and runtime profile remain isolated.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { acceptanceInstallEnvironment } from './acceptance-install-env.mjs'
import { packFlagqai } from './pack-flagqai.mjs'
import { parseDocument } from 'yaml'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readdir, readFile, writeFile, symlink, rm, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, delimiter, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (process.platform === 'win32') throw new Error('This process-group acceptance probe requires a POSIX host')
const modelSwitch = process.argv.includes('--model-switch')
if (modelSwitch && process.argv.includes('--live')) throw new Error('--model-switch requires the isolated scripted model')
const interactions = process.argv.includes('--interactions')
if (interactions && process.argv.includes('--live')) throw new Error('--interactions requires the isolated scripted model')
const cleanInstall = process.argv.includes('--clean-install')
const freshProfileInstall = process.argv.includes('--fresh-profile-install')
if (freshProfileInstall && cleanInstall) throw new Error('--fresh-profile-install and --clean-install are separate acceptance modes')
if (freshProfileInstall && (process.env.FLAGQAI_ACCEPTANCE_RUNTIME_MANIFEST === undefined || process.env.FLAGQAI_ACCEPTANCE_UPSTREAM_VERSION === undefined)) {
  throw new Error('--fresh-profile-install requires an explicit host manifest and upstream version')
}
if (cleanInstall && process.env.FLAGQAI_ACCEPTANCE_UPSTREAM_VERSION !== undefined) {
  throw new Error('Alternate Harness versions require the linked-host acceptance mode; --clean-install uses the managed pin')
}
// Slow public registries can require a longer cold install. Keep the default
// bounds, while allowing an explicit bounded override for acceptance runners.
const installTimeout = process.env.FLAGQAI_ACCEPTANCE_INSTALL_TIMEOUT_MS === undefined
  ? undefined : Number(process.env.FLAGQAI_ACCEPTANCE_INSTALL_TIMEOUT_MS)
if (installTimeout !== undefined && (!Number.isSafeInteger(installTimeout) || installTimeout < 1000 || installTimeout > 3600000)) {
  throw new Error('FLAGQAI_ACCEPTANCE_INSTALL_TIMEOUT_MS must be an integer from 1000 to 3600000')
}
const sharedNpmCache = process.env.FLAGQAI_ACCEPTANCE_NPM_CACHE
if (sharedNpmCache !== undefined && !isAbsolute(sharedNpmCache)) {
  throw new Error('FLAGQAI_ACCEPTANCE_NPM_CACHE must be an absolute path')
}
const verifyTodoPolicy = process.argv.includes('--todo-policy')
if (verifyTodoPolicy && process.argv.includes('--live')) throw new Error('--todo-policy requires the isolated scripted model')
const cli = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(process.env.FLAGQAI_ACCEPTANCE_RUNTIME_MANIFEST ?? new URL('../package.json', import.meta.url))
const expectedUpstreamVersion = process.env.FLAGQAI_ACCEPTANCE_UPSTREAM_VERSION ?? '0.2.1-rc.2'
if (!cleanInstall) assert.equal(require('@deepseek-ai/dsh/package.json').version, expectedUpstreamVersion,
  'Run cli:setup or supply FLAGQAI_ACCEPTANCE_RUNTIME_MANIFEST and FLAGQAI_ACCEPTANCE_UPSTREAM_VERSION for an alternate host')
const cliDependencies = await realpath(join(cli, 'node_modules'))
const dependencies = cleanInstall ? undefined : dirname(dirname(dirname(require.resolve('@deepseek-ai/dsh/package.json'))))
const sandbox = await mkdtemp(join(tmpdir(), 'flagqai-cli-acceptance-'))
const home = join(sandbox, 'home')
const integration = join(sandbox, 'managed')
const profile = join(cleanInstall ? join(integration, 'dsh') : join(sandbox, 'dsh'), 'profiles', 'flagqai')
const packed = join(profile, 'node_modules', '@flagqai', 'cli')
const workspace = join(sandbox, 'workspace')
const live = process.argv.includes('--live')
const realMcp = live || process.argv.includes('--real-mcp')
const vqe = process.argv.includes('--vqe')
if (vqe && (!realMcp || live)) throw new Error('--vqe requires --real-mcp and the isolated scripted model')
const researchVqe = process.argv.includes('--research-vqe')
if (researchVqe && (!realMcp || live)) throw new Error('--research-vqe requires --real-mcp and the isolated scripted model')
const gateway = process.argv.includes('--gateway')
const disconnect = process.argv.includes('--disconnect')
let serverProcess
let base
let logs = ''
let requests = 0
let acceptancePassed = false
let failModel = false
let failDiscovery = false
let discoveryRequests = 0
let approvalCalls = 0
let cancellationRequests = 0
let inkModelHistoryObserved = false
let researchVqeResource
let researchReportEnergy
const circuit = JSON.stringify([{ name: 'h', index: [0] }, { name: 'cx', index: [0, 1] }])
// H2/STO-3G at r = 0.7350 Angstrom. This is the ELECTRONIC Hamiltonian:
// its identity offset excludes nuclear repulsion. It must not be compared to
// the separate 0.7414 Angstrom total-energy experiment. The pinned MCP rejects
// identity-only observables, so train on measurable terms and restore this
// electronic offset in the independent acceptance calculation.
const vqeBondLengthAngstrom = 0.7350
const vqeNuclearRepulsionHartree = 0.719968994449
const vqeExactElectronicHartree = -1.857275030202
const vqeExactTotalHartree = -1.137306035753
const vqeIdentityOffset = -1.052373245772859
const vqeHamiltonian = [
  { pauli: 'ZI', coefficient: 0.39793742484318045 },
  { pauli: 'IZ', coefficient: -0.39793742484318045 },
  { pauli: 'ZZ', coefficient: -0.01128010425623538 },
  { pauli: 'XX', coefficient: 0.18093119978423156 },
]
const vqeCircuit = JSON.stringify([
  { name: 'x', index: [0] },
  { name: 'ry', index: [1], parameters: { theta: { $parameter: 'theta' } } },
  { name: 'cx', index: [1, 0] },
])
const researchHamiltonian = [
  { pauli: 'II', coefficient: vqeIdentityOffset }, ...vqeHamiltonian,
]
const researchRequest = {
  schema: 'flagquantum.ground_state_vqe_request.v1',
  hamiltonian: {
    schema: 'flagquantum.pauli_sum.v1', n_qubits: 2,
    coefficient_unit: 'hartree', basis_convention: 'wire_0_is_leftmost',
    terms: researchHamiltonian,
  },
  fixed_hamming_weight: 1,
  ansatz: { name: 'two_qubit_single_excitation', initial_basis_state: '01', initial_parameters: [0] },
  optimizer: { name: 'adam', max_evaluations: 121, learning_rate: 0.1 },
}
function findStructured(value, predicate) {
  if (typeof value === 'string') {
    try { return findStructured(JSON.parse(value), predicate) } catch { return undefined }
  }
  if (value === null || typeof value !== 'object') return undefined
  if (predicate(value)) return value
  for (const nested of Object.values(value)) {
    const found = findStructured(nested, predicate)
    if (found !== undefined) return found
  }
}
let exported = ''
let simulation
let toolNames = []
const todoPromptSamples = { first: [], followUp: [] }
const todoBoundaryPhases = { first: 0, second: 0 }
const firstTaskTodos = [
  { content: 'Inspect the first task', status: 'in_progress' },
  { content: 'Verify the first result', status: 'pending' },
]
const completedFirstTaskTodos = firstTaskTodos.map(todo => ({ ...todo, status: 'completed' }))
const secondTaskTodos = [
  { content: 'Plan the second task', status: 'in_progress' },
  { content: 'Verify the second result', status: 'pending' },
]
const model = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && new URL(request.url, 'http://fixture').pathname.endsWith('/models')) {
      discoveryRequests++
      if (failDiscovery) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: `Rejected fixture key ${request.headers.authorization ?? request.headers['x-api-key'] ?? ''}` } }))
      } else {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ data: [{ id: gateway ? 'claude-acceptance' : 'deepseek-chat', object: 'model' }] }))
      }
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests++
    if (disconnect) await new Promise(resolve => setTimeout(resolve, 75))
    if (!live && process.env.FLAGQAI_ACCEPTANCE_DEBUG === '1') console.log(`Model fixture request ${requests}`)
    if (failModel) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Fixture credentials rejected', type: 'authentication_error' } }))
      return
    }
    const anthropic = request.url.includes('/messages')
    toolNames = body.tools.map(tool => tool.function?.name ?? tool.name)
    const results = anthropic ? body.messages.flatMap(message => Array.isArray(message.content) ? message.content.filter(block => block.type === 'tool_result') : []) : body.messages.filter(message => message.role === 'tool')
    const latest = body.messages.filter(message => message.role === 'user').map(message => message.content)
    const badTool = JSON.stringify(latest).includes('tool-failure-check')
    const vqeRequest = JSON.stringify(latest).includes('vqe-route-check')
    const researchVqeRequest = JSON.stringify(latest).includes('research-vqe-check')
    const resuming = JSON.stringify(latest).includes('resume-check')
    if (JSON.stringify(latest).includes('resume-check-ink-model')) {
      inkModelHistoryObserved = body.messages.some(message =>
        JSON.stringify(message).includes('Restored Bell task and its tool history.'))
      assert.equal(inkModelHistoryObserved, true,
        'the switched Ink model request must include the previous Harness turn')
    }
    const approving = JSON.stringify(latest).includes('approval-check')
    const cancelling = JSON.stringify(latest).includes('cancel-check')
    if (verifyTodoPolicy) {
      const kind = resuming ? 'followUp' : JSON.stringify(latest).includes('Create a Bell state with H and CX') ? 'first' : undefined
      if (kind) {
        const prompt = JSON.stringify([body.system, ...body.messages.filter(message => message.role === 'system' || message.role === 'developer')])
        todoPromptSamples[kind].push({
          tool: toolNames.includes('todo_write'),
          policy: prompt.includes('For each new nontrivial user request with several concrete steps'),
          bodyPolicy: JSON.stringify(body).includes('For each new nontrivial user request with several concrete steps'),
        })
      }
    }
    let delta
    let finish = 'stop'
    const call = (name, input) => {
      assert.ok(toolNames.includes(name), `native tool missing: ${name}`)
      finish = 'tool_calls'
      return { role: 'assistant', tool_calls: [{ index: 0, id: `call-${requests}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }] }
    }
    const todoBoundaryTask = verifyTodoPolicy && JSON.stringify(latest).includes('todo-boundary-second') ? 'second'
      : verifyTodoPolicy && JSON.stringify(latest).includes('todo-boundary-first') ? 'first' : undefined
    if (todoBoundaryTask) {
      const phase = todoBoundaryPhases[todoBoundaryTask]++
      if (todoBoundaryTask === 'first') {
        delta = phase < 2 ? call('todo_write', { todos: phase === 0 ? firstTaskTodos : completedFirstTaskTodos })
          : { role: 'assistant', content: 'The first two-step task is complete.' }
      } else {
        if (phase === 0) await new Promise(resolve => setTimeout(resolve, 250))
        delta = phase === 0 ? call('todo_write', { todos: secondTaskTodos })
          : { role: 'assistant', content: 'The second two-step task has its own plan.' }
      }
    } else if (researchVqeRequest) {
      const bundle = results.length === 0 ? undefined : findStructured(results[0].content,
        value => value.schema === 'flagquantum.research_capability_evidence_bundle.v1')
      if (results.length === 0) delta = call('mcp__flagquantum__execute_local_capability_tool', {
        capability_id: 'ground_state.solve.vqe', request: researchRequest,
        options: { target: 'local-cpu', provider_order: ['flagquantum-native'], allow_provider_fallback: false },
      })
      else if (results.length === 1) delta = call('mcp__flagquantum__validate_evidence_tool', {
        validator_id: 'ground_state.solve.exact', evidence: bundle,
      })
      else if (results.length === 2) delta = call('mcp__flagquantum__validate_evidence_tool', {
        validator_id: 'validate.energy_variance', evidence: bundle,
      })
      else {
        assert.ok(Number.isFinite(bundle?.result?.energy), 'research response needs a measured energy')
        delta = { role: 'assistant', content: `FlagQuantum research VQE energy ${bundle.result.energy.toFixed(6)} Ha; evidence validators returned.` }
      }
    } else if (vqeRequest) {
      delta = results.length === 0
        ? call('mcp__flagquantum__train_parameters_tool', {
          circuit: vqeCircuit, circuit_format: 'qir', hamiltonian: vqeHamiltonian,
          steps: 150, learning_rate: 0.1,
        })
        : { role: 'assistant', content: 'FlagQuantum VQE training returned; independent acceptance is owned by the test runner.' }
    } else if (cancelling) {
      cancellationRequests++
      // The real Harness must interrupt this pending model request. A delayed
      // response makes an accidental completed turn observable as a failure.
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 30000)
        response.once('close', () => { clearTimeout(timer); resolve() })
      })
      if (response.destroyed) return
      delta = { role: 'assistant', content: 'Cancellation failed: fixture completed.' }
    } else if (approving) {
      if (results.length === 0) {
        approvalCalls++
        delta = call('write', { file_path: join(workspace, 'approval-evidence.txt'), content: 'approved once',
          sandbox_permissions: 'danger-full-access', justification: 'Verify the isolated acceptance fixture write after explicit approval.' })
      } else delta = { role: 'assistant', content: 'Approved fixture write complete.' }
    } else if (badTool) delta = results.length === 0 ? call('mcp__flagquantum__simulate_circuit_tool', { circuit: 'invalid' }) : { role: 'assistant', content: 'Tool failed: invalid circuit. Inspect the input before retrying.' }
    else if (resuming) delta = { role: 'assistant', content: 'Restored Bell task and its tool history.' }
    else if (results.length === 0) delta = call('mcp__flagquantum__simulate_circuit_tool', {
      circuit, circuit_format: 'qir', outputs: [{ kind: 'probabilities', wires: [0, 1] }],
    })
    else if (results.length === 1) {
      const text = results[0].content
      simulation = typeof text === 'string' ? text : JSON.stringify(text)
      delta = call('mcp__flagquantum__emit_openqasm_tool', { circuit, circuit_format: 'qir', version: 3.0 })
    } else if (results.length === 2) {
      exported = typeof results[1].content === 'string' ? results[1].content : JSON.stringify(results[1].content)
      assert.match(exported, /OPENQASM/)
      delta = call('write', { file_path: join(workspace, 'bell-evidence.json'), content: JSON.stringify({ simulation, exported }, null, 2) })
    } else delta = { role: 'assistant', content: 'Bell task complete. Local simulation and OpenQASM saved in bell-evidence.json.' }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    if (anthropic) {
      const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      send('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } })
      const tool = delta.tool_calls?.[0]
      send('content_block_start', { index: 0, content_block: tool ? { type: 'tool_use', id: tool.id, name: tool.function.name, input: {} } : { type: 'text', text: '' } })
      send('content_block_delta', { index: 0, delta: tool ? { type: 'input_json_delta', partial_json: tool.function.arguments } : { type: 'text_delta', text: delta.content } })
      send('content_block_stop', { index: 0 })
      send('message_delta', { delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } })
      send('message_stop', {})
      response.end()
      return
    }
    for (const choice of [{ delta, finish_reason: null }, { delta: {}, finish_reason: finish }]) {
      response.write(`data: ${JSON.stringify({ id: 'acceptance-fixture', object: 'chat.completion.chunk', created: 1, model: body.model,
        choices: [{ index: 0, ...choice }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
    }
    response.end('data: [DONE]\n\n')
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: error.message } }))
  }
})
async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}
async function waitFor(probe, label, ms = 60000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) throw new Error(`Server exited: ${logs}`)
    try { const result = await probe(); if (result) return result } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`${label} timed out: ${logs}`)
}
async function stop() {
  if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) return
  const exited = once(serverProcess, 'exit')
  // Launcher spawns Harness: terminate its process group, not just the wrapper.
  process.kill(-serverProcess.pid, 'SIGTERM')
  const timer = setTimeout(() => { try { process.kill(-serverProcess.pid, 'SIGKILL') } catch {} }, 5000)
  await exited
  clearTimeout(timer)
  if (base) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      // A stale pooled HTTP socket can fail even while the old listener lives.
      const stopped = await new Promise(resolve => {
        const url = new URL(base)
        const socket = createConnection({ host: url.hostname, port: Number(url.port) })
        const settle = value => { socket.destroy(); resolve(value) }
        socket.once('connect', () => settle(false))
        socket.once('error', error => settle(error.code === 'ECONNREFUSED'))
        socket.setTimeout(500, () => settle(false))
      })
      if (stopped) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('Harness listener did not stop')
  }
}
try {
  if (!cleanInstall && !freshProfileInstall) await mkdir(packed, { recursive: true })
  await mkdir(home, { recursive: true })
  await mkdir(workspace, { recursive: true })
  const report = await packFlagqai({ root: cli, destination: sandbox,
    env: { ...process.env, npm_config_cache: sharedNpmCache ?? join(sandbox, 'npm-cache') } })
  const archivePath = report.path
  console.log(`Acceptance tarball SHA-256: ${createHash('sha256').update(await readFile(archivePath)).digest('hex')}; ${process.platform}/${process.arch} Node ${process.version}`)
  if (freshProfileInstall) {
    const dsh = require.resolve('@deepseek-ai/dsh/package.json').replace(/package.json$/, 'lib/bin.js')
    execFileSync(process.execPath, [dsh, 'plugin', '--profile', 'flagqai', 'add', '-w', archivePath], {
      cwd: sandbox,
      env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: join(sandbox, 'dsh'),
        PATH: `${join(dependencies, '.bin')}${delimiter}${process.env.PATH}`,
        npm_config_cache: sharedNpmCache ?? join(sandbox, 'npm-cache') },
      stdio: 'inherit', timeout: installTimeout ?? 300000,
    })
    assert.equal(createRequire(join(profile, 'package.json'))('@flagqai/cli/package.json').version, '0.1.0')
    console.log('Fresh profile plugin installed on explicit Harness host')
  } else if (!cleanInstall) {
    execFileSync('tar', ['-xzf', archivePath, '-C', packed, '--strip-components=1'])
    for (const entry of await readdir(cliDependencies)) {
      // The tarball already contains the vendored scopes. Replacing them with
      // development links would make this a source-tree test instead of a
      // packaged-plugin test (and fails with EEXIST on recent npm archives).
      if (entry !== '@dsh-std' && entry !== '@flagqai-vendor') {
        await symlink(join(entry === '@deepseek-ai' ? dependencies : cliDependencies, entry), join(packed, 'node_modules', entry), 'dir')
      }
    }
    for (const entry of await readdir(cliDependencies)) {
      if (entry !== '@flagqai') await symlink(join(entry === '@deepseek-ai' ? dependencies : cliDependencies, entry), join(profile, 'node_modules', entry), 'dir')
    }
    await writeFile(join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: { '@flagqai/cli': '0.1.0',
      '@deepseek-ai/dsh-base': require('@deepseek-ai/dsh-base/package.json').version },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@flagqai/cli'] } } }))
    await writeFile(join(profile, 'cordis.patch.yml'), '[]\n')
  }
  let liveRoute
  if (live) {
    assert.ok(process.env.FLAGQAI_ACCEPTANCE_LIVE_PROFILE && process.env.FLAGQAI_ACCEPTANCE_LIVE_DSH_HOME,
      '--live requires explicit profile patch and credential-home paths')
    const patches = parseDocument(await readFile(process.env.FLAGQAI_ACCEPTANCE_LIVE_PROFILE, 'utf8'), {
      customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: source => ({ __jsExpr: source }) }],
    }).toJS()
    const providers = patches.find(row => row.id === 'llm-pi-ai')?.config?.providers
    const route = process.env.FLAGQAI_ACCEPTANCE_LIVE_ROUTE
    assert.ok(route && providers?.[route], 'Explicit live route must exist in the supplied profile')
    liveRoute = { route, ...providers[route] }
    const credentials = parseDocument(await readFile(join(process.env.FLAGQAI_ACCEPTANCE_LIVE_DSH_HOME, '.credentials.yaml'), 'utf8')).toJS()
    liveRoute.apiKey = credentials.refs?.[liveRoute.apiKeyEnv]
    assert.equal(typeof liveRoute.apiKey, 'string', 'Selected route credential must exist')
  }
  const bin = join(sandbox, 'bin')
  await mkdir(bin)
  if (!cleanInstall) {
    const dsh = require.resolve('@deepseek-ai/dsh/package.json').replace(/package.json$/, 'lib/bin.js')
    await writeFile(join(bin, 'dsh'), `#!/bin/sh\nexec '${process.execPath}' '${dsh}' "$@"\n`, { mode: 0o755 })
  }
  if (!realMcp) {
    const fixture = join(sandbox, 'mcp.mjs')
    await writeFile(fixture, `import { createInterface } from 'node:readline';
const schema = { type: 'object', properties: { circuit: {type:'string'}, circuit_format: {type:'string'}, outputs: {type:'array'}, version:{type:'number'} }, required:['circuit'] };
createInterface({input:process.stdin}).on('line', line => {
 const message = JSON.parse(line); if (message.id === undefined) return;
 let result = {};
 if (message.method === 'initialize') result={protocolVersion:message.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'explicit-fixture',version:'1'}};
 if (message.method === 'tools/list') result={tools:['simulate_circuit_tool','emit_openqasm_tool'].map(name=>({name,description:'Deterministic fixture',inputSchema:schema,annotations:{readOnlyHint:true}}))};
 if (message.method === 'tools/call') result={content:[{type:'text',text:message.params.name==='simulate_circuit_tool' ? JSON.stringify({outputs:[{kind:'probabilities',wires:[0,1],value:[0.5,0,0,0.5]}],fixture:true}) : 'OPENQASM 3.0; h q[0]; cx q[0], q[1];'}]};
 if (message.method === 'tools/call' && message.params.arguments.circuit === 'invalid') result={isError:true,content:[{type:'text',text:'Invalid circuit: expected a JSON gate list'}]};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result})+'\\n');
});`)
    await writeFile(join(bin, 'uvx'), `#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'uvx fixture'; exit 0; fi\nexec '${process.execPath}' '${fixture}'\n`, { mode: 0o755 })
  }
  const inherited = { ...Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR']
    .flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]])),
    ...acceptanceInstallEnvironment(process.env) }
  const env = { ...inherited, HOME: home, USERPROFILE: home, ...(cleanInstall ? { FLAGQAI_CLI_RUNTIME_ROOT: integration } : { DSH_HOME: join(sandbox, 'dsh') }),
    PATH: `${bin}${delimiter}${process.env.PATH}`, FLAGQAI_LANG: 'en', FLAGQAI_PRESET: 'flagquantum', DSH_TELEMETRY_DISABLED: '1' }
  // Keep the existing uv cache outside the isolated preferences home; an
  // empty HOME must not trigger repeated Python/package downloads per restart.
  // A cache may be reused while HOME, installation target and every runtime
  // preference remain isolated. Setup installs the pinned MCP even when the
  // task itself uses the deterministic MCP fixture.
  env.UV_CACHE_DIR = process.env.UV_CACHE_DIR ?? execFileSync('uv', ['cache', 'dir'], { encoding: 'utf8' }).trim()
  let entry = join(packed, 'bin/flagqai.js')
  if (cleanInstall) {
    const installation = join(sandbox, 'installation')
    await mkdir(installation)
    await writeFile(join(installation, 'package.json'), '{"private":true}\n')
    // Only executable shims escape the sandbox; installed dependencies may not.
    await symlink(process.execPath, join(bin, 'node'))
    const npmExecutable = execFileSync('which', ['npm'], { encoding: 'utf8' }).trim()
    await symlink(await realpath(npmExecutable), join(bin, 'npm'))
    // Managed setup always installs the pinned MCP with uv, including when
    // subsequent task execution uses the deterministic MCP fixture.
    for (const name of realMcp ? ['uv', 'uvx'] : ['uv']) {
      await symlink(execFileSync('which', [name], { encoding: 'utf8' }).trim(), join(bin, name))
    }
    env.PATH = `${bin}:/usr/bin:/bin`
    env.npm_config_cache = sharedNpmCache ?? join(sandbox, 'initial-npm-cache')
    execFileSync('npm', ['install', archivePath, '--omit=dev', '--omit=peer', '--no-audit', '--no-fund'], { cwd: installation, env, stdio: 'inherit', timeout: installTimeout ?? 300000 })
    entry = join(installation, 'node_modules', '@flagqai', 'cli', 'bin', 'flagqai.js')
    console.log('Fresh npm package installed; no global dsh or host profile on PATH')
    const help = execFileSync(process.execPath, [entry, '--help'], { cwd: workspace, env, encoding: 'utf8' })
    assert.match(help, /flagqai setup/)
    const notReady = spawn(process.execPath, [entry, 'serve'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let reason = ''
    notReady.stderr.on('data', chunk => { reason += chunk })
    assert.equal((await once(notReady, 'exit'))[0], 1)
    assert.match(reason, /flagqai setup/)
    execFileSync(process.execPath, [entry, 'setup'], { cwd: workspace, env, stdio: 'inherit', timeout: installTimeout ?? 600000 })
    // An already ready setup must not run an installer or overwrite configuration.
    execFileSync(process.execPath, [entry, 'setup'], { cwd: workspace, env, stdio: 'inherit', timeout: 15000 })
    const doctor = execFileSync(process.execPath, [entry, 'doctor'], { cwd: workspace, env, encoding: 'utf8', timeout: 30000 })
    assert.match(doctor, /FlagQAI managed runtime: ready/)
    assert.match(doctor, /Harness: 0\.2\.1-rc\.2 \(expected 0\.2\.1-rc\.2\)/)
    if (!realMcp) {
      // Setup proves the pinned MCP installs; scripted task checks still need
      // the deterministic fixture at the executable path managed launch uses.
      const managedMcp = join(integration, 'quantum-bin', 'flagquantum-mcp-server')
      await rm(managedMcp)
      await writeFile(managedMcp, `#!/bin/sh\nexec '${process.execPath}' '${join(sandbox, 'mcp.mjs')}'\n`, { mode: 0o755 })
    }
    const owned = [installation, integration]
    const ownedRoot = await realpath(sandbox)
    async function checkLinks(directory) {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, item.name)
        if (item.isSymbolicLink()) assert.ok((await realpath(path)).startsWith(`${ownedRoot}/`), `dependency escaped clean installation: ${path}`)
        else if (item.isDirectory()) await checkLinks(path)
      }
    }
    for (const directory of owned) await checkLinks(directory)
    console.log('PASS clean dependency trees: no repository/host module links')
  }
  // A clean profile resolves Harness peers through the official boot-time
  // module fallback. Direct imports before boot bypass that native contract.
  if (!cleanInstall && !freshProfileInstall) execFileSync(process.execPath, ['--input-type=module', '-e', "await import('@flagqai/cli/server-host')"], { cwd: profile, env, stdio: 'pipe' })
  if (realMcp) {
    const preflight = JSON.parse(execFileSync(process.execPath,
      [entry, 'quantum', '--check', '--json', 'Solve a two-qubit VQE ground state'],
      { cwd: workspace, env, encoding: 'utf8', timeout: 600000 }))
    assert.equal(preflight.status, 'ready')
    assert.deepEqual(preflight.runtimeChecks, ['simulate_circuit_tool', 'train_parameters_tool'])
    assert.equal(preflight.toolUseObserved, false, 'a one-step probe is not session tool-use evidence')
    assert.equal(preflight.scientificResultValidated, null)
    console.log('PASS installed pinned MCP: Bell simulation and one-step VQE trainer preflight')
    const researchPreflight = JSON.parse(execFileSync(process.execPath,
      [entry, 'quantum', '--check', '--json', 'Calculate H2 ground-state energy with VQE'],
      { cwd: workspace, env, encoding: 'utf8', timeout: 600000 }))
    assert.equal(researchPreflight.status, 'ready')
    assert.equal(researchPreflight.package, 'flagquantum-mcp-server==0.3.2')
    assert.equal(researchPreflight.capability.id, 'research-ground-state')
    assert.deepEqual(researchPreflight.requiredTools, [
      'search_capabilities_tool', 'describe_capability_tool', 'validate_capability_input_tool',
      'estimate_capability_tool', 'execute_local_capability_tool', 'validate_evidence_tool',
    ])
    assert.ok(researchPreflight.requiredTools.every(name => researchPreflight.runtimeChecks.includes(name)),
      'the installed MCP must execute the bounded six-tool research preflight')
    assert.equal(researchPreflight.toolUseObserved, false)
    assert.equal(researchPreflight.scientificResultValidated, null)
    console.log('PASS installed pinned MCP: six-tool H2 research preflight and independent evidence checks')
  }
  const modelPort = await listen(model)
  const reservation = createServer()
  const port = await listen(reservation)
  await new Promise(resolve => reservation.close(resolve))
  base = `http://127.0.0.1:${port}`
  const { createFlagQaiClient } = await import(pathToFileURL(join(packed, 'lib/flagqai-platform/sdk/index.mjs')))
  const client = createFlagQaiClient({ baseUrl: base })
  async function start() {
    serverProcess = spawn(process.execPath, [entry, 'serve', '--port', String(port)], { cwd: workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    serverProcess.stdout.on('data', chunk => { logs = (logs + chunk).slice(-12000) })
    serverProcess.stderr.on('data', chunk => { logs = (logs + chunk).slice(-12000); if (!live && process.env.FLAGQAI_ACCEPTANCE_DEBUG === '1') process.stderr.write(chunk) })
    await waitFor(() => client.health(), 'packaged CLI startup')
  }
  async function attach(args) {
    const child = spawn(process.execPath, [entry, 'attach', base, '--json', ...args], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', errors = ''
    child.stdout.on('data', chunk => { output += chunk; if (!live && process.env.FLAGQAI_ACCEPTANCE_DEBUG === '1') process.stderr.write(chunk) })
    child.stderr.on('data', chunk => { errors += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000)
    const [code] = await once(child, 'exit')
    clearTimeout(timer)
    return { code, errors, records: output.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }
  }
  await start()
  console.log('Packaged server ready; configuring isolated catalog provider')
  if (!live) assert.equal((await client.listProviders()).ready, false, 'clean profile must not borrow host credentials')
  if (!live) {
    const discoveryInput = {
      kind: gateway ? 'custom' : 'catalog', route: gateway ? 'acceptance-gateway' : 'deepseek',
      apiKey: 'acceptance-fixture-key', baseURL: `http://127.0.0.1:${modelPort}/v1`,
      ...(gateway ? { api: 'anthropic-messages' } : {}),
    }
    failDiscovery = true
    await assert.rejects(client.discoverProviderModels(discoveryInput), error => {
      assert.equal(error.code, 'provider_discovery_failed')
      assert.equal(JSON.stringify(error).includes(discoveryInput.apiKey), false, 'discovery failure must not expose the API key')
      return true
    })
    failDiscovery = false
    const discovered = await client.discoverProviderModels(discoveryInput)
    assert.ok(discovered.some(item => item.id === (gateway ? 'claude-acceptance' : 'deepseek-chat')))
    assert.ok(discoveryRequests >= 2, 'failed discovery must retry against the live fixture')
    assert.equal(logs.includes(discoveryInput.apiKey), false, 'server logs must not expose the API key')
    console.log('PASS offline provider discovery: rejected key is masked, retry succeeds')
  }
  const provider = await client.configureProvider(live ? { kind: 'custom', route: liveRoute.route, baseURL: liveRoute.baseURL, api: liveRoute.api, apiKey: liveRoute.apiKey,
    models: [process.env.FLAGQAI_ACCEPTANCE_LIVE_MODEL] } : { kind: gateway ? 'custom' : 'catalog', route: gateway ? 'acceptance-gateway' : 'deepseek', apiKey: 'acceptance-fixture-key',
    ...(gateway ? { api: 'anthropic-messages' } : {}),
    baseURL: `http://127.0.0.1:${modelPort}/v1`, models: [gateway ? 'claude-acceptance' : 'deepseek-chat', ...(modelSwitch ? ['acceptance-second-model'] : [])] })
  assert.equal(provider.keyConfigured, true)
  assert.equal((await client.listProviders()).ready, true)
  await stop()
  await start()
  const restartedProviderState = await client.listProviders()
  assert.equal(restartedProviderState.ready, true, 'saved credential survives restart')
  if (!live) assert.equal(JSON.stringify(restartedProviderState).includes('acceptance-fixture-key'), false, 'provider status must not expose the API key')
  console.log('Provider persisted; running Bell task')
  const taskArgs = ['--cwd', workspace, '--prompt', live ? 'Use FlagQuantum MCP to build the two-qubit Bell state H(0), CX(0,1), obtain exact probabilities on wires [0,1], and export OpenQASM 3. Save bell-evidence.json with simulation (the actual simulation result as a JSON string) and exported (the actual OpenQASM as a string). Do not invent results. Explain that this is local classical simulation.' : 'Create a Bell state with H and CX, simulate it and export OpenQASM.']
  let first
  if (disconnect) {
    const { runAttachCli } = await import(pathToFileURL(join(packed, 'bin/attach.js')))
    let output = '', errors = ''
    const dropped = await runAttachCli([base, '--json', ...taskArgs], {
      stdin: { isTTY: false }, stdout: { write: text => { output += text } }, stderr: { write: text => { errors += text } },
      fetch: async (url, init) => {
        const response = await fetch(url, init)
        if (!new URL(url).pathname.endsWith('/events')) return response
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        return new Response(new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) { controller.close(); return }
                buffer += decoder.decode(value, { stream: true })
                let boundary
                while ((boundary = buffer.indexOf('\n\n')) >= 0) {
                  const frame = buffer.slice(0, boundary + 2)
                  buffer = buffer.slice(boundary + 2)
                  controller.enqueue(new TextEncoder().encode(frame))
                  if (frame.includes('"type":"tool.result"')) {
                    controller.close()
                    await reader.cancel()
                    return
                  }
                }
              }
            } catch (error) { controller.error(error) }
          }, cancel() { return reader.cancel() },
        }), { headers: response.headers })
      },
    })
    assert.equal(dropped, 1, errors)
    assert.match(errors, /Event stream closed/)
    const partial = output.trim().split('\n').map(line => JSON.parse(line))
    const resourceId = partial[0].session
    const recovered = []
    const signal = AbortSignal.timeout(60000)
    for await (const row of client.events(resourceId, { signal })) {
      recovered.push(row)
      if (row.event.type === 'turn.end') {
        assert.equal(row.event.reason.kind, 'completed')
        break
      }
    }
    first = { code: 0, errors: '', records: recovered }
    assert.equal(new Set(recovered.filter(row => row.event.type === 'user.message' && row.event.text === taskArgs[3]).map(row => row.event.id)).size, 1, 'transport recovery must not resubmit the Bell task')
    for (const name of ['mcp__flagquantum__simulate_circuit_tool', 'mcp__flagquantum__emit_openqasm_tool', 'write']) {
      assert.equal(recovered.filter(row => row.event.type === 'tool.call' && row.event.name === name).length, 1, `${name} must execute exactly once`)
    }
    const inspection = await attach(['--resource', resourceId, '--prompt', 'resume-check: summarize the completed Bell task'])
    assert.equal(inspection.code, 0, inspection.errors)
    assert.ok(inspection.records.some(row => row.event.type === 'tool.result'), 'resource reattach restores buffered tool results')
    console.log('PASS mid-tool stream disconnect: bounded exit, durable replay, one user task and one execution of each Bell tool')
  } else first = await attach(taskArgs)
  assert.equal(first.code, 0, first.errors + logs)
  const calls = first.records.filter(row => row.event.type === 'tool.call')
  assert.ok(calls.some(row => row.event.name === 'mcp__flagquantum__simulate_circuit_tool'))
  assert.ok(calls.some(row => row.event.name === 'mcp__flagquantum__emit_openqasm_tool'))
  assert.ok(calls.some(row => row.event.name === 'write'))
  assert.equal(first.records.filter(row => row.event.type === 'tool.result' && row.event.isError).length, 0)
  const callEvidence = await client.flagQuantumEvidence(first.records[0].session)
  assert.equal(callEvidence.source, 'harness-session-events')
  assert.equal(callEvidence.toolUseObserved, true)
  assert.equal(callEvidence.callsReturned, 2)
  assert.equal(callEvidence.callsFailed, 0)
  assert.equal(callEvidence.scientificResultValidated, null)
  const telemetry = await client.scienceTelemetry(first.records[0].session)
  assert.equal(telemetry.source, 'backend-session-history+permission-journal')
  assert.ok(telemetry.counts.toolCalls >= 3, 'installed session history must contain the MCP and file-write calls')
  assert.equal(telemetry.counts.toolFailed, 0)
  assert.equal(telemetry.counts.permissionDecisions, telemetry.permissionOutcomes.length,
    'a complete durable journal must account for each permission decision without model-authored counts')
  assert.ok(telemetry.events.some(row => row.eventType === 'tool_call' && row.toolName === 'mcp__flagquantum__simulate_circuit_tool'))
  assert.equal(JSON.stringify(telemetry).includes('acceptance-fixture-key'), false, 'telemetry must not expose provider credentials')
  const evidence = JSON.parse(await readFile(join(workspace, 'bell-evidence.json'), 'utf8'))
  assert.match(evidence.exported, /OPENQASM/)
  // Parse the actual model-facing Tool result, not a model-written summary.
  function simulationResult(value) {
    if (typeof value === 'string') {
      try { return simulationResult(JSON.parse(value)) } catch {
        const start = value.indexOf('{'), end = value.lastIndexOf('}')
        if (start >= 0 && end > start) { try { return simulationResult(JSON.parse(value.slice(start, end + 1))) } catch {} }
      }
    }
    if (value && typeof value === 'object') {
      if (Array.isArray(value.outputs)) return value
      for (const nested of Object.values(value)) { const result = simulationResult(nested); if (result) return result }
    }
  }
  const simulationCall = calls.find(row => row.event.name === 'mcp__flagquantum__simulate_circuit_tool').event.callId
  const simulationEvent = first.records.find(row => row.event.type === 'tool.result' && row.event.callId === simulationCall)
  const result = simulationResult(simulationEvent?.event.content)
  assert.ok(result, 'Tool result must contain structured simulation outputs')
  assert.deepEqual(simulationResult(evidence.simulation)?.outputs, result.outputs, 'saved evidence must match actual Tool output')
  const probabilities = result.outputs.find(output => output.kind === 'probabilities').value
  assert.equal(probabilities.length, 4)
  for (const [index, value] of probabilities.entries()) assert.ok(Math.abs(value - [0.5, 0, 0, 0.5][index]) < 1e-6)
  if (realMcp) assert.equal(result.execution?.execution_path, 'local_statevector')
  let completedResource = first.records[0].session
  if (modelSwitch) {
    const catalog = await client.listSessionModels(completedResource)
    assert.ok(catalog.models.some(item => item.id === 'acceptance-second-model'))
    const original = await client.getSession(completedResource)
    await assert.rejects(client.switchSessionModel(completedResource, { provider: provider.route, model: 'unavailable-model' }), error => error.code === 'model_switch_failed')
    assert.equal((await client.getSession(completedResource)).sessionId, original.sessionId)
    const child = await client.switchSessionModel(completedResource, { provider: provider.route, model: 'acceptance-second-model' })
    assert.notEqual(child.sessionId, original.sessionId)
    assert.notEqual(child.id, completedResource)
    assert.equal((await client.listSessionModels(child.id)).current.model, 'acceptance-second-model')
    completedResource = child.id
    console.log('Native model fork preserved the completed task; unavailable model left the source unchanged')
  }
  const nativeId = (await client.getSession(completedResource)).sessionId
  await stop()
  await start()
  const resumed = await attach(['--cwd', workspace, '--session', nativeId, '--prompt', 'resume-check: summarize the completed Bell task'])
  assert.equal(resumed.code, 0, resumed.errors + logs)
  assert.ok(resumed.records.some(row => row.meta.replay && row.event.type === 'tool.result'), 'tool history must survive a real process restart')
  assert.ok(resumed.records.some(row => row.meta.replay && row.event.type === 'assistant.message'))
  if (verifyTodoPolicy) {
    for (const [kind, samples] of Object.entries(todoPromptSamples)) {
      assert.ok(samples.length > 0, `installed model fixture did not receive ${kind} turn`)
      assert.ok(samples.every(sample => sample.tool && sample.policy),
        `installed ${kind} turn must expose todo_write and task-specific Todo guidance to the model: ${JSON.stringify(samples)}`)
    }
    console.log('PASS installed Todo policy: native tool and fresh-list guidance reach the first and resumed turns')
    const firstTodoTurn = await attach(['--cwd', workspace, '--prompt', 'todo-boundary-first: complete two local steps'])
    assert.equal(firstTodoTurn.code, 0, firstTodoTurn.errors + logs)
    assert.equal(firstTodoTurn.records.filter(row => row.event.type === 'tool.call' && row.event.name === 'todo_write' && !row.meta.replay).length, 2)
    assert.ok(firstTodoTurn.records.some(row => row.event.type === 'session.view' &&
      JSON.stringify(row.event.todos) === JSON.stringify(completedFirstTaskTodos)),
    'the completed first Todo list must reach the installed session view')
    const todoResource = firstTodoTurn.records[0].session
    const secondTodoTurn = await attach(['--resource', todoResource, '--prompt', 'todo-boundary-second: start a separate two-step task'])
    assert.equal(secondTodoTurn.code, 0, secondTodoTurn.errors + logs)
    assert.equal(secondTodoTurn.records[0].session, todoResource, 'the second task must reuse the same Harness session')
    const current = secondTodoTurn.records.filter(row => !row.meta.replay)
    const clear = current.findIndex(row => row.event.type === 'session.view' && Array.isArray(row.event.todos) && row.event.todos.length === 0)
    const fresh = current.findIndex(row => row.event.type === 'session.view' &&
      JSON.stringify(row.event.todos) === JSON.stringify(secondTaskTodos))
    assert.ok(clear >= 0 && fresh > clear, 'the old completed list must clear before the new task-specific list appears')
    // The attach stream may project historical tool calls more than once on
    // reattach; the fixture phase count below measures new model requests.
    assert.equal(todoBoundaryPhases.first, 3)
    assert.equal(todoBoundaryPhases.second, 2)
    console.log('PASS installed Todo boundary: completed plan clears and a new plan appears in the same Harness session')
  }
  const resumedEvidence = await client.flagQuantumEvidence(resumed.records[0].session)
  assert.equal(resumedEvidence.callsReturned, 2, 'native restart must retain authoritative call evidence')
  assert.deepEqual(JSON.parse(await readFile(join(workspace, 'bell-evidence.json'), 'utf8')), evidence)
  if (vqe) {
    const vqeTurn = await attach(['--cwd', workspace, '--prompt', 'vqe-route-check: solve the retrospective two-qubit Hamiltonian using FlagQuantum'])
    assert.equal(vqeTurn.code, 0, vqeTurn.errors + logs)
    const trainingCalls = vqeTurn.records.filter(row => row.event.type === 'tool.call' && row.event.name === 'mcp__flagquantum__train_parameters_tool' && !row.meta.replay)
    assert.equal(trainingCalls.length, 1, 'VQE must actually call the pinned FlagQuantum trainer once')
    const trainingEvent = vqeTurn.records.find(row => row.event.type === 'tool.result' && row.event.callId === trainingCalls[0].event.callId)
    assert.ok(trainingEvent && !trainingEvent.event.isError, 'FlagQuantum training must return successfully')
    const findTrainingResult = value => {
      if (typeof value === 'string') {
        try { return findTrainingResult(JSON.parse(value)) } catch { return undefined }
      }
      if (!value || typeof value !== 'object') return undefined
      if (value.status === 'success' && value.parameters && Number.isInteger(value.completed_steps)) return value
      for (const nested of Object.values(value)) {
        const found = findTrainingResult(nested)
        if (found) return found
      }
    }
    const trained = findTrainingResult(trainingEvent.event.content)
    assert.ok(trained, 'Harness tool result must contain the real structured FlagQuantum training result')
    assert.equal(trained.completed_steps, 150)
    assert.ok(trained.completed_steps <= 500, 'VQE must respect the retrospective evaluation budget')
    assert.equal(trained.losses.length, trained.completed_steps)
    const theta = trained.parameters.theta
    assert.ok(Number.isFinite(theta), 'trained angle must be finite')

    // Independent two-dimensional eigensystem in the |01>,|10> parity block;
    // no FlagQuantum code, statevector, or reported accuracy metric is reused.
    const [zi, iz, zz, xx] = vqeHamiltonian.map(term => term.coefficient)
    const energy01 = vqeIdentityOffset + zi - iz - zz
    const energy10 = vqeIdentityOffset - zi + iz - zz
    const coupling = xx
    const s = Math.sin(theta / 2), c = Math.cos(theta / 2)
    const variationalEnergy = energy01 * s * s + energy10 * c * c + 2 * coupling * s * c
    const oddSectorMinimum = (energy01 + energy10) / 2 - Math.hypot((energy01 - energy10) / 2, coupling)
    const evenSectorMinimum = vqeIdentityOffset + zz - Math.abs(coupling)
    const exactEnergy = Math.min(oddSectorMinimum, evenSectorMinimum)
    assert.ok(Math.abs(exactEnergy - vqeExactElectronicHartree) < 1e-9,
      `H2 ${vqeBondLengthAngstrom} Angstrom electronic fixture changed`)
    assert.ok(Math.abs(exactEnergy + vqeNuclearRepulsionHartree - vqeExactTotalHartree) < 1e-9,
      'H2 electronic and total energies must not be conflated')
    const variance = (energy01 * s + coupling * c) ** 2 + (coupling * s + energy10 * c) ** 2 - variationalEnergy ** 2
    assert.ok(Math.abs(variationalEnergy - (trained.final_loss + vqeIdentityOffset)) < 1e-5,
      'independent energy must agree with the FlagQuantum trainer plus identity offset')
    assert.ok(Math.abs(variationalEnergy - exactEnergy) <= 1e-4, 'independent exact energy check failed')
    assert.ok(Math.abs(variance) <= 1e-4, 'independent energy variance check failed')
    const vqeEvidence = await client.flagQuantumEvidence(vqeTurn.records[0].session)
    assert.equal(vqeEvidence.callsTotal, 1)
    assert.equal(vqeEvidence.callsReturned, 1)
    assert.equal(vqeEvidence.callsFailed, 0)
    assert.equal(vqeEvidence.scientificResultValidated, null, 'the product must not claim the test runner\'s acceptance as runtime validation')
    assert.equal(vqeEvidence.vqeNumericalEvidence.status, 'passed',
      `runtime numerical check: ${vqeEvidence.vqeNumericalEvidence.reasonCodes.join(', ')}`)
    assert.ok(Math.abs(vqeEvidence.vqeNumericalEvidence.computedEnergy + vqeIdentityOffset - variationalEnergy) < 1e-5,
      'runtime numerical check must agree with the independent acceptance runner')
    assert.ok(Math.abs(vqeEvidence.vqeNumericalEvidence.exactGroundEnergy + vqeIdentityOffset - exactEnergy) < 1e-9)
    console.log(`PASS pinned FlagQuantum VQE via Harness: trainer called once, ${trained.completed_steps} steps, independent error ${Math.abs(variationalEnergy - exactEnergy)}, variance ${variance}`)
  }
  if (researchVqe) {
    const turn = await attach(['--cwd', workspace, '--prompt',
      'research-vqe-check: execute the H2 electronic Hamiltonian using FlagQuantum ground_state.solve.vqe'])
    assert.equal(turn.code, 0, turn.errors + logs)
    researchVqeResource = turn.records[0].session
    const calls = turn.records.filter(row => row.event.type === 'tool.call' && !row.meta.replay)
    const executions = calls.filter(row => row.event.name === 'mcp__flagquantum__execute_local_capability_tool')
    assert.equal(executions.length, 1, 'research VQE must execute the real FlagQuantum capability once')
    const execution = turn.records.find(row => row.event.type === 'tool.result'
      && row.event.callId === executions[0].event.callId)
    assert.ok(execution && !execution.event.isError, 'research capability must return without a tool error')
    const bundle = findStructured(execution.event.content,
      value => value.schema === 'flagquantum.research_capability_evidence_bundle.v1')
    assert.ok(bundle, 'the real MCP must return a structured Evidence Bundle')
    assert.equal(bundle.status, 'succeeded')
    assert.equal(bundle.capability.capability_id, 'ground_state.solve.vqe')
    researchReportEnergy = bundle.result.energy.toFixed(6)
    assert.ok(bundle.result.resources.objective_evaluations <= 121)

    // Independently apply the Pauli sum to the returned amplitudes. No
    // FlagQuantum code or reported numerical accuracy is used for this check.
    const basisStates = bundle.result.statevector.basis_states
    const amplitudes = new Map(basisStates.map((basis, index) => {
      const value = bundle.result.statevector.amplitudes[index]
      assert.match(basis, /^[01]{2}$/)
      assert.ok(Number.isFinite(value.real) && Number.isFinite(value.imag))
      if (basis.split('1').length - 1 !== 1) {
        assert.ok(Math.hypot(value.real, value.imag) < 1e-6,
          'the returned state must remain in the weight-one sector')
      }
      return [basis, [value.real, value.imag]]
    }))
    assert.equal(amplitudes.size, basisStates.length, 'statevector basis labels must be unique')
    const norm = [...amplitudes.values()].reduce((sum, [real, imag]) => sum + real ** 2 + imag ** 2, 0)
    assert.ok(Math.abs(norm - 1) < 1e-6, 'statevector must be normalized')
    const transformed = new Map([...amplitudes.keys()].map(basis => [basis, [0, 0]]))
    for (const { pauli, coefficient } of researchHamiltonian) {
      for (const [basis, [real, imag]] of amplitudes) {
        const bits = [...basis]
        let sign = 1
        for (const [wire, operator] of [...pauli].entries()) {
          if (operator === 'Z' && bits[wire] === '1') sign *= -1
          if (operator === 'X') bits[wire] = bits[wire] === '0' ? '1' : '0'
        }
        const target = transformed.get(bits.join(''))
        assert.ok(target, 'Pauli term must preserve the declared statevector support')
        target[0] += coefficient * sign * real
        target[1] += coefficient * sign * imag
      }
    }
    let energy = 0
    let secondMoment = 0
    for (const [basis, [real, imag]] of amplitudes) {
      const [hReal, hImag] = transformed.get(basis)
      energy += real * hReal + imag * hImag
      secondMoment += hReal ** 2 + hImag ** 2
    }
    const variance = secondMoment - energy ** 2
    const [zi, iz, zz, xx] = vqeHamiltonian.map(term => term.coefficient)
    const energy01 = vqeIdentityOffset + zi - iz - zz
    const energy10 = vqeIdentityOffset - zi + iz - zz
    const exactEnergy = (energy01 + energy10) / 2 - Math.hypot((energy01 - energy10) / 2, xx)
    assert.ok(Math.abs(exactEnergy - vqeExactElectronicHartree) < 1e-9)
    assert.ok(Math.abs(energy - bundle.result.energy) < 2e-6, 'independent energy must match MCP result')
    assert.ok(Math.abs(energy - exactEnergy) <= 2e-5, 'independent exact H2 electronic energy check failed')
    assert.ok(Math.abs(variance) <= 1e-5, 'independent energy variance check failed')
    const evidence = await client.flagQuantumEvidence(turn.records[0].session)
    assert.equal(evidence.callsTotal, 3)
    assert.equal(evidence.callsReturned, 3)
    assert.equal(evidence.callsFailed, 0)
    assert.equal(evidence.researchValidatorEvidence.status, 'passed',
      `runtime validator evidence: ${JSON.stringify(evidence.researchValidatorEvidence)}`)
    assert.deepEqual(evidence.researchValidatorEvidence.passedValidators,
      ['ground_state.solve.exact', 'validate.energy_variance'])
    assert.equal(evidence.researchVqeNumericalEvidence.status, 'passed',
      `runtime research numerical check: ${JSON.stringify(evidence.researchVqeNumericalEvidence)}`)
    assert.ok(Math.abs(evidence.researchVqeNumericalEvidence.computedEnergy - energy) < 2e-6)
    assert.ok(Math.abs(evidence.researchVqeNumericalEvidence.exactSectorEnergy - exactEnergy) < 1e-9)
    assert.equal(evidence.scientificResultValidated, null,
      'runtime validator observations must not be represented as independent scientific acceptance')
    console.log(`PASS pinned FlagQuantum research VQE via Harness: independent error ${Math.abs(energy - exactEnergy)}, variance ${variance}`)
  }
  if (!realMcp) {
    const bad = await attach(['--cwd', workspace, '--prompt', 'tool-failure-check'])
    assert.equal(bad.code, 0, bad.errors)
    assert.ok(bad.records.some(row => row.event.type === 'tool.result' && row.event.isError), 'individual Tool failure must remain observable even when the agent completes its explanation')
    const badEvidence = await client.flagQuantumEvidence(bad.records[0].session)
    assert.equal(badEvidence.callsFailed, 1)
  }
  if (interactions) {
    async function watch(id, terminal = event => event.type === 'turn.end') {
      const controller = new AbortController()
      const records = []
      let error
      const done = (async () => {
        try {
          for await (const row of client.events(id, { signal: controller.signal })) {
            records.push(row)
            if (terminal(row.event)) break
          }
        } catch (cause) { if (!controller.signal.aborted) error = cause }
      })()
      return { records, done, controller, get error() { return error } }
    }
    const approval = await client.openSession({ backendId: 'dsh', cwd: workspace })
    const approvalWatch = await watch(approval.id)
    try {
      assert.equal((await client.submitMessage(approval.id, { clientMessageId: 'approval-check', text: 'approval-check' })).accepted, true)
      const requested = await waitFor(() => approvalWatch.records.find(row => row.event.type === 'permission.request') ??
        (approvalWatch.error && Promise.reject(approvalWatch.error)), 'native permission request')
      assert.equal(approvalCalls, 1, 'one model tool call must request approval')
      await assert.rejects(readFile(join(workspace, 'approval-evidence.txt')), { code: 'ENOENT' })
      const requestId = requested.event.request.requestId
      assert.ok(requestId)
      assert.equal((await client.answerPermission(approval.id, requestId, { kind: 'allow-once' })).accepted, true)
      await waitFor(() => approvalWatch.records.find(row => row.event.type === 'turn.end') ??
        (approvalWatch.error && Promise.reject(approvalWatch.error)), 'approved turn end')
      await approvalWatch.done
      assert.ok(approvalWatch.records.some(row => row.event.type === 'permission.settled' && row.event.requestId === requestId))
      assert.equal(approvalWatch.records.find(row => row.event.type === 'turn.end').event.reason.kind, 'completed')
      assert.equal(await readFile(join(workspace, 'approval-evidence.txt'), 'utf8'), 'approved once')
      assert.equal(approvalCalls, 1, 'approved write must not be resubmitted')
      assert.equal(approvalWatch.records.filter(row => row.event.type === 'tool.call' && row.event.name === 'write' && !row.meta.replay).length, 1)
      await assert.rejects(client.answerPermission(approval.id, requestId, { kind: 'allow-once' }), error => error.code === 'interaction_not_found')
      console.log('PASS installed native approval: pending, one-shot answer, settled, one write')
    } finally { approvalWatch.controller.abort(); await approvalWatch.done }

    const cancellation = await client.openSession({ backendId: 'dsh', cwd: workspace })
    const cancelWatch = await watch(cancellation.id, event => event.type === 'session.control' && event.state === 'stopped')
    try {
      assert.equal((await client.submitMessage(cancellation.id, { clientMessageId: 'cancel-check', text: 'cancel-check' })).accepted, true)
      await waitFor(() => cancellationRequests > 0 || (cancelWatch.error && Promise.reject(cancelWatch.error)), 'pending model request')
      const receipt = await client.cancelSession(cancellation.id, { cause: 'user' })
      assert.equal(receipt.outcome, 'confirmed')
      await waitFor(() => cancelWatch.records.find(row => row.event.type === 'session.control' && row.event.state === 'stopped') ??
        (cancelWatch.error && Promise.reject(cancelWatch.error)), 'stopped cancellation')
      await cancelWatch.done
      const ended = cancelWatch.records.find(row => row.event.type === 'turn.end')
      assert.ok(['aborted', 'interrupted'].includes(ended.event.reason.kind), `unexpected cancel reason: ${JSON.stringify(ended.event.reason)}`)
      assert.ok(cancelWatch.records.some(row => row.event.type === 'session.control' && row.event.state === 'stopped'),
        'receipt alone does not prove the turn stopped')
      assert.equal(cancellationRequests, 1, 'cancelled turn must not resubmit the model request')
      assert.equal(cancelWatch.records.filter(row => row.event.type === 'tool.call' && !row.meta.replay).length, 0)
      console.log('PASS installed native cancellation: confirmed receipt, terminal turn and stopped control')
    } finally { cancelWatch.controller.abort(); await cancelWatch.done }
  }
  acceptancePassed = true
  console.log(`PASS packaged CLI: isolated configuration, ${live ? 'existing live route' : gateway ? 'Anthropic gateway' : 'catalog provider'}, Bell tools/file${modelSwitch ? ', native model switch' : ''}, process restart/resume${live ? '' : ', API failure'}. MCP=${realMcp ? 'real pinned FlagQuantum' : 'deterministic fixture'}; model=${live ? 'live configured route' : 'scripted fixture'}; dependencies=${cleanInstall ? 'fresh npm install, isolated managed Harness/profile' : freshProfileInstall ? 'fresh official plugin install on explicit Harness host' : 'reused installed tree'}.`)
} finally {
  await stop()
  model.closeAllConnections()
  await new Promise(resolve => model.close(resolve))
  if (!acceptancePassed && !live && process.env.FLAGQAI_ACCEPTANCE_KEEP_SANDBOX === '1') {
    console.error(`Retained scripted acceptance sandbox for diagnosis: ${sandbox}`)
  } else {
    await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
