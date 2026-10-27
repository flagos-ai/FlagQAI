import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, open, rm, statfs } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { quantumCapabilityFor, requiredQuantumTools, researchQuantumTools } from './quantum-capability.js'
import { FLAGQUANTUM_MCP_ARGS, FLAGQUANTUM_MCP_PACKAGE, FLAGQUANTUM_MCP_PYTHON } from './quantum-mcp-profile.js'

export { quantumCapabilityFor, requiredQuantumTools } from './quantum-capability.js'
export { FLAGQUANTUM_MCP_ARGS, FLAGQUANTUM_MCP_PACKAGE } from './quantum-mcp-profile.js'
const PROTOCOL_VERSION = '2025-03-26'
const MAX_RESPONSE_BYTES = 1024 * 1024
const MIN_FREE_DISK_BYTES = 2 * 1024 ** 3
const DISK_CHECK_INTERVAL_MS = 5000
const SMOKE_CIRCUIT = JSON.stringify([{ name: 'h', index: [0] }, { name: 'cx', index: [0, 1] }])
const SMOKE_TRAINING_CIRCUIT = JSON.stringify([
  { name: 'x', index: [0] },
  { name: 'ry', index: [1], parameters: { theta: { $parameter: 'theta' } } },
  { name: 'cx', index: [1, 0] },
])
// An already-solvable two-qubit problem exercises the research contract
// without downloading molecular data or asking a model to invent a reduction.
const RESEARCH_SMOKE_REQUEST = {
  schema: 'flagquantum.ground_state_vqe_request.v1',
  hamiltonian: {
    schema: 'flagquantum.pauli_sum.v1', n_qubits: 2,
    coefficient_unit: 'hartree', basis_convention: 'wire_0_is_leftmost',
    terms: [
      { pauli: 'II', coefficient: -1 },
      { pauli: 'ZI', coefficient: -0.5 },
      { pauli: 'IZ', coefficient: 0.5 },
    ],
  },
  fixed_hamming_weight: 1,
  ansatz: { name: 'two_qubit_single_excitation', initial_basis_state: '01', initial_parameters: [0] },
  optimizer: { name: 'adam', max_evaluations: 5, learning_rate: 0.1 },
}

function preflightError(code, message) {
  return Object.assign(new Error(message), { code })
}

async function freeDiskBytes(directory) {
  const { bavail, bsize } = await statfs(directory)
  return Number(bavail) * Number(bsize)
}

async function checkDiskSpace(directories, probeFreeBytes, minimumFreeBytes) {
  for (const [label, directory, variable] of directories) {
    let free
    try { free = await probeFreeBytes(directory) }
    catch { throw preflightError('disk_check_failed', `Cannot check free disk space in the ${label}: ${directory}. Check ${variable} and the filesystem; no model request was sent.`) }
    if (!Number.isFinite(free) || free < 0) {
      throw preflightError('disk_check_failed', `Cannot determine free disk space in the ${label}: ${directory}. Check ${variable} and the filesystem; no model request was sent.`)
    }
    if (free < minimumFreeBytes) {
      throw preflightError('insufficient_disk_space', `Less than ${Math.ceil(minimumFreeBytes / 1024 ** 3)} GiB is free in the ${label}: ${directory}. Free space or set ${variable} to a volume with more space before starting FlagQuantum MCP; no model request was sent.`)
    }
  }
}

async function writeProbe(scratch) {
  const file = await open(join(scratch, 'write-probe'), 'wx')
  try {
    // Creating a directory alone can succeed on a volume that cannot accept
    // file data. Sync a small real write before describing it as writable.
    await file.writeFile(Buffer.alloc(64 * 1024))
    await file.sync()
  } finally {
    await file.close()
  }
}

async function checkWritableDirectory(directory, label, code, create = false, probeWrite = writeProbe) {
  let scratch
  try {
    if (create) await mkdir(directory, { recursive: true })
    scratch = await mkdtemp(join(directory, '.flagqai-preflight-'))
    await probeWrite(scratch)
  } catch {
    throw preflightError(code, `${label} is not writable: ${directory}`)
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true })
  }
}

function defaultUvCacheDirectory({ cwd, env }) {
  return effectiveUvDirectory('cache', { cwd, env })
}

function effectiveUvDirectory(kind, { cwd, env }) {
  const probe = spawnSync('uv', [kind, 'dir'], {
    cwd, env, encoding: 'utf8', timeout: 5000, maxBuffer: 4096,
  })
  if (probe.error || probe.status !== 0) {
    throw preflightError(`${kind}_discovery_failed`, `Cannot locate the uv ${kind} directory. Check the uv installation and directory configuration.`)
  }
  return probe.stdout.trim()
}

async function checkUvDirectory({ cwd, env, kind, variable, probe, probeWrite }) {
  const explicit = typeof env[variable] === 'string' && env[variable].length > 0
  let directory
  try { directory = explicit ? env[variable] : probe(kind, { cwd, env }) }
  catch { throw preflightError(`${kind}_discovery_failed`, `Cannot locate the uv ${kind} directory. Check uv and ${variable}.`) }
  if (typeof directory !== 'string' || !isAbsolute(directory)) {
    throw preflightError(`${kind}_path_not_absolute`, `${variable} must resolve to an absolute path`)
  }
  try { await checkWritableDirectory(directory, `uv ${kind} directory`, `${kind}_dir_not_writable`, true, probeWrite) }
  catch { throw preflightError(`${kind}_dir_not_writable`, `uv ${kind} directory is not writable: ${directory}. Set ${variable} to a writable absolute path.`) }
  return directory
}

function validateSimulation(result) {
  if (result?.isError === true) throw new Error('FlagQuantum MCP simulation failed during preflight')
  const text = result?.content?.find(item => item?.type === 'text')?.text
  let payload
  try { payload = JSON.parse(text) } catch { throw new Error('FlagQuantum MCP simulation returned invalid JSON') }
  const probabilities = payload?.outputs?.find(output => output?.kind === 'probabilities')?.value
  if (!Array.isArray(probabilities) || probabilities.length !== 4 ||
      probabilities.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
      Math.abs(probabilities[0] - 0.5) > 1e-6 || Math.abs(probabilities[1]) > 1e-6 ||
      Math.abs(probabilities[2]) > 1e-6 || Math.abs(probabilities[3] - 0.5) > 1e-6) {
    throw new Error('FlagQuantum MCP simulation failed the Bell-state preflight')
  }
}

function validateTraining(result) {
  if (result?.isError === true) {
    throw preflightError('vqe_runtime_unavailable', 'FlagQuantum VQE trainer failed its one-step preflight; no model request was sent.')
  }
  const text = result?.content?.find(item => item?.type === 'text')?.text
  let trained
  try { trained = JSON.parse(text) } catch { /* Report a bounded, credential-free error below. */ }
  if (trained?.status !== 'success' || trained.completed_steps !== 1 ||
      !Array.isArray(trained.losses) || trained.losses.length !== 1 ||
      !Number.isFinite(trained.losses[0]) || !Number.isFinite(trained.final_loss) ||
      !Number.isFinite(trained.parameters?.theta)) {
    throw preflightError('vqe_runtime_unavailable', 'FlagQuantum VQE trainer returned an invalid one-step result; no model request was sent.')
  }
}

function researchError(message) {
  return preflightError('research_runtime_unavailable', `${message}; no model request was sent.`)
}

function researchToolPayload(result, name) {
  if (result?.isError === true) throw researchError(`FlagQuantum ${name} failed its bounded preflight`)
  const text = result?.content?.find(item => item?.type === 'text')?.text
  let payload
  try { payload = JSON.parse(text) } catch { /* Report a bounded error below. */ }
  if (payload?.status !== 'success') throw researchError(`FlagQuantum ${name} returned an invalid result`)
  return payload.result
}

async function validateResearchContract(request) {
  const call = async (name, args) => researchToolPayload(await request('tools/call', { name, arguments: args }), name)
  const capabilityId = 'ground_state.solve.vqe'
  const search = await call('search_capabilities_tool', { query: { domain: 'ground_state' } })
  if (!Array.isArray(search) || !search.some(item => item?.capability_id === capabilityId)) {
    throw researchError('FlagQuantum did not discover the ground-state VQE capability')
  }
  const manifest = await call('describe_capability_tool', { capability_id: capabilityId })
  const validators = ['ground_state.solve.exact', 'validate.energy_variance']
  if (manifest?.capability_id !== capabilityId || manifest?.implementation_status !== 'available' ||
      !Array.isArray(manifest.validators) || !validators.every(id => manifest.validators.includes(id))) {
    throw researchError('FlagQuantum did not describe the expected bounded VQE contract')
  }
  const input = await call('validate_capability_input_tool', { capability_id: capabilityId, request: RESEARCH_SMOKE_REQUEST })
  if (input?.passed !== true) throw researchError('FlagQuantum rejected the bounded research input')
  const estimate = await call('estimate_capability_tool', {
    capability_id: capabilityId, request: RESEARCH_SMOKE_REQUEST, target: 'local-cpu',
  })
  if (estimate?.supported !== true || !Number.isInteger(estimate?.metrics?.objective_evaluations) ||
      estimate.metrics.objective_evaluations < 1 || estimate.metrics.objective_evaluations > 5) {
    throw researchError('FlagQuantum did not accept the bounded local research estimate')
  }
  const evidence = await call('execute_local_capability_tool', {
    capability_id: capabilityId, request: RESEARCH_SMOKE_REQUEST,
    options: { target: 'local-cpu', provider_order: ['flagquantum-native'], allow_provider_fallback: false },
  })
  if (evidence?.schema !== 'flagquantum.research_capability_evidence_bundle.v1' ||
      evidence.status !== 'succeeded' || evidence.capability?.capability_id !== capabilityId ||
      evidence.execution?.fallback_used !== false || evidence.capability?.provider !== 'flagquantum-native' ||
      !Number.isInteger(evidence.metrics?.objective_evaluations) ||
      evidence.metrics.objective_evaluations < 1 || evidence.metrics.objective_evaluations > 5) {
    throw researchError('FlagQuantum returned an invalid or fallback research evidence bundle')
  }
  const amplitudes = evidence.result?.statevector?.amplitudes
  const basis = evidence.result?.statevector?.basis_states
  if (!Array.isArray(amplitudes) || amplitudes.length !== 4 ||
      JSON.stringify(basis) !== JSON.stringify(['00', '01', '10', '11']) ||
      amplitudes.some(value => !Number.isFinite(value?.real) || !Number.isFinite(value?.imag))) {
    throw researchError('FlagQuantum research evidence lacks a valid two-qubit statevector')
  }
  let norm = 0, energy = 0, secondMoment = 0
  for (let index = 0; index < 4; index += 1) {
    const probability = amplitudes[index].real ** 2 + amplitudes[index].imag ** 2
    const diagonal = -1 - 0.5 * (index < 2 ? 1 : -1) + 0.5 * (index % 2 === 0 ? 1 : -1)
    norm += probability
    energy += probability * diagonal
    secondMoment += probability * diagonal ** 2
  }
  if (!Number.isFinite(evidence.result?.energy) || Math.abs(norm - 1) > 1e-5 || Math.abs(energy + 2) > 1e-4 ||
      Math.abs(energy - evidence.result?.energy) > 1e-4 ||
      Math.abs(secondMoment - energy ** 2) > 1e-4) {
    throw researchError('FlagQuantum research evidence failed independent energy and variance checks')
  }
  for (const validatorId of validators) {
    if (!Array.isArray(evidence.validation) ||
        !evidence.validation.some(report => report?.validator_id === validatorId && report.passed === true)) {
      throw researchError(`FlagQuantum evidence omitted ${validatorId}`)
    }
    const report = await call('validate_evidence_tool', { validator_id: validatorId, evidence })
    if (report?.validator_id !== validatorId || report.passed !== true) {
      throw researchError(`FlagQuantum ${validatorId} did not validate the research evidence`)
    }
  }
  return researchQuantumTools()
}

async function discoverTools({ command, args, cwd, env, spawnProcess, timeoutMs, requiredTools, onProgress,
  monitorDisk, diskCheckIntervalMs }) {
  onProgress('mcp-starting')
  const child = spawnProcess(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false })
  const pending = new Map()
  let buffer = ''
  let receivedBytes = 0
  const decoder = new TextDecoder()
  let failure
  const fail = error => {
    if (failure) return
    failure = error
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }
  const timer = setTimeout(() => fail(preflightError('mcp_timeout',
    `FlagQuantum MCP did not answer within ${Math.ceil(timeoutMs / 1000)} seconds. Check the pinned package installation and available disk space; no model request was sent.`)), timeoutMs)
  timer.unref?.()
  let diskCheckRunning = false
  let finished = false
  const diskTimer = monitorDisk && setInterval(() => {
    if (finished || failure || diskCheckRunning) return
    diskCheckRunning = true
    monitorDisk().catch(error => {
      if (finished) return
      fail(error)
      child.kill()
    }).finally(() => { diskCheckRunning = false })
  }, diskCheckIntervalMs)
  diskTimer?.unref?.()
  child.on('error', () => fail(new Error('Cannot start the pinned FlagQuantum MCP. Check that uvx is installed and reachable.')))
  child.on('exit', code => fail(preflightError('mcp_startup_failed',
    `FlagQuantum MCP exited before tool discovery (code ${code}). Verify Python ${FLAGQUANTUM_MCP_PYTHON}, uv cache space, and the pinned package installation.`)))
  child.stdin.on('error', () => fail(new Error('FlagQuantum MCP closed its input before tool discovery.')))
  child.stderr.on('data', () => {}) // Drain stderr without exposing dependency paths or credentials.
  child.stdout.on('data', chunk => {
    receivedBytes += chunk.length
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      fail(new Error('FlagQuantum MCP tool response exceeds the preflight limit'))
      child.kill()
      return
    }
    buffer += decoder.decode(chunk, { stream: true })
    let boundary
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary).trim()
      buffer = buffer.slice(boundary + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) }
      catch { fail(new Error('FlagQuantum MCP returned invalid JSON')); return }
      if (message === null || typeof message !== 'object' || Array.isArray(message)) {
        fail(new Error('FlagQuantum MCP returned an invalid protocol message'))
        return
      }
      if (!pending.has(message.id)) continue
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) waiter.reject(new Error('FlagQuantum MCP rejected a preflight request'))
      else waiter.resolve(message.result)
    }
  })
  let id = 0
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    if (failure) { reject(failure); return }
    id += 1
    pending.set(id, { resolve, reject })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  try {
    const initialized = await request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'flagqai-cli-preflight', version: '0.1.0' },
    })
    if (!initialized?.capabilities?.tools) throw new Error('FlagQuantum MCP did not advertise tool support')
    onProgress('mcp-initialized')
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    const names = new Set()
    const serverInfo = initialized.serverInfo && typeof initialized.serverInfo.name === 'string'
      ? { name: initialized.serverInfo.name, version: typeof initialized.serverInfo.version === 'string' ? initialized.serverInfo.version : null }
      : null
    let cursor
    for (let page = 0; page < 20; page += 1) {
      const listing = await request('tools/list', cursor ? { cursor } : {})
      if (!Array.isArray(listing?.tools)) throw new Error('FlagQuantum MCP returned an invalid tool list')
      for (const tool of listing.tools) if (typeof tool?.name === 'string') names.add(tool.name)
      cursor = listing.nextCursor
      if (!cursor) {
        const missing = requiredTools.filter(name => !names.has(name))
        if (missing.length > 0) {
          throw preflightError('required_tool_missing', `FlagQuantum MCP lacks required task tools: ${missing.join(', ')}`)
        }
        onProgress('tools-discovered')
        if (!names.has('simulate_circuit_tool')) throw new Error('FlagQuantum MCP lacks the simulation tool required for runtime verification')
        validateSimulation(await request('tools/call', {
          name: 'simulate_circuit_tool',
          arguments: { circuit: SMOKE_CIRCUIT, circuit_format: 'qir', outputs: [{ kind: 'probabilities', wires: [0, 1] }] },
        }))
        const runtimeChecks = ['simulate_circuit_tool']
        if (requiredTools.includes('train_parameters_tool')) {
          validateTraining(await request('tools/call', {
            name: 'train_parameters_tool',
            arguments: {
              circuit: SMOKE_TRAINING_CIRCUIT, circuit_format: 'qir',
              hamiltonian: [{ pauli: 'ZI', coefficient: 0.4 }, { pauli: 'XX', coefficient: 0.18 }],
              steps: 1, learning_rate: 0.1,
            },
          }))
          runtimeChecks.push('train_parameters_tool')
        }
        if (requiredTools.includes('execute_local_capability_tool')) {
          runtimeChecks.push(...await validateResearchContract(request))
        }
        if (monitorDisk) await monitorDisk()
        if (failure) throw failure
        onProgress('runtime-verified')
        return { names, serverInfo, runtimeChecks }
      }
    }
    throw new Error('FlagQuantum MCP tool list exceeded the page limit')
  } finally {
    finished = true
    clearTimeout(timer)
    if (diskTimer) clearInterval(diskTimer)
    child.kill()
  }
}

/** Verify the exact pinned MCP and a writable workspace before model inference. */
export async function preflightFlagQuantum({
  task = '', cwd = process.cwd(), env = process.env,
  command = env.FLAGQAI_MANAGED_MCP_EXECUTABLE || 'uvx', args = command === 'uvx' ? FLAGQUANTUM_MCP_ARGS : [],
  spawnProcess = spawn, timeoutMs = 600000,
  probeCacheDir = defaultUvCacheDirectory,
  probeUvDir = effectiveUvDirectory,
  probeWrite = writeProbe,
  probeFreeBytes = freeDiskBytes,
  minimumFreeBytes = MIN_FREE_DISK_BYTES,
  diskCheckIntervalMs = DISK_CHECK_INTERVAL_MS,
  onProgress = () => {},
} = {}) {
  const capability = quantumCapabilityFor(task)
  const requiredTools = requiredQuantumTools(task)
  await checkWritableDirectory(cwd, 'FlagQuantum task workspace', 'workspace_not_writable', false, probeWrite)
  const managedCommand = typeof env.FLAGQAI_MANAGED_MCP_EXECUTABLE === 'string'
    && command === env.FLAGQAI_MANAGED_MCP_EXECUTABLE
  let cacheDir
  // uvx can write outside UV_CACHE_DIR while creating a tool environment or
  // downloading Python. Catch sandboxed HOME failures before MCP startup.
  let monitorDisk
  if (!managedCommand) {
    const explicitCache = typeof env.UV_CACHE_DIR === 'string' && env.UV_CACHE_DIR.length > 0
    try {
      cacheDir = explicitCache ? env.UV_CACHE_DIR : probeCacheDir({ cwd, env })
    } catch (error) {
      if (error?.code === 'cache_discovery_failed') throw error
      throw preflightError('cache_discovery_failed', 'Cannot locate the uv cache. Check the uv installation and cache configuration.')
    }
    if (typeof cacheDir !== 'string' || !isAbsolute(cacheDir)) {
      throw preflightError('cache_path_not_absolute', 'The uv cache directory must be an absolute path for FlagQuantum tasks')
    }
    await checkWritableDirectory(cacheDir, 'FlagQuantum uv cache', 'cache_not_writable', true, probeWrite)
    if (basename(command) === 'uvx') {
      const toolDir = await checkUvDirectory({ cwd, env, kind: 'tool', variable: 'UV_TOOL_DIR', probe: probeUvDir, probeWrite })
      const pythonDir = await checkUvDirectory({ cwd, env, kind: 'python', variable: 'UV_PYTHON_INSTALL_DIR', probe: probeUvDir, probeWrite })
      const directories = [
        ['uv cache', cacheDir, 'UV_CACHE_DIR'],
        ['uv tool directory', toolDir, 'UV_TOOL_DIR'],
        ['uv Python directory', pythonDir, 'UV_PYTHON_INSTALL_DIR'],
      ]
      monitorDisk = () => checkDiskSpace(directories, probeFreeBytes, minimumFreeBytes)
      await monitorDisk()
    }
  }
  const { names: tools, serverInfo, runtimeChecks } = await discoverTools({ command, args, cwd, env, spawnProcess,
    timeoutMs, requiredTools, onProgress, monitorDisk, diskCheckIntervalMs })
  return {
    schemaVersion: 1,
    status: 'ready',
    package: FLAGQUANTUM_MCP_PACKAGE,
    capability,
    pythonVersion: FLAGQUANTUM_MCP_PYTHON,
    serverInfo,
    toolCount: tools.size,
    discoveredTools: [...tools].sort(),
    requiredTools,
    runtimeChecks,
    workspace: cwd,
    uvCache: cacheDir ? { status: 'writable', path: cacheDir } : { status: 'not-required' },
    // Readiness proves that a pinned server answered, not that a subsequent
    // model turn used it or that a scientific result passed acceptance.
    toolUseObserved: false,
    scientificResultValidated: null,
  }
}
