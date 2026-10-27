import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { FLAGQUANTUM_MCP_ARGS, preflightFlagQuantum, quantumCapabilityFor, requiredQuantumTools } from '../bin/quantum-preflight.js'
import { FLAGQUANTUM_MCP_INSTALL_ARGS, FLAGQUANTUM_MCP_INSTALL_ID, FLAGQUANTUM_MCP_PACKAGE, FLAGQUANTUM_MCP_PYTHON, FLAGQUANTUM_MCP_TORCH_ARGS } from '../bin/quantum-mcp-profile.js'
import { heavyweightMcpLifecyclePolicy } from '../../../packages/server/settings/project-settings-catalog.mjs'

const fixture = fileURLToPath(new URL('./quantum-preflight-fixture.mjs', import.meta.url))

/**
 * Remove a temporary directory, retrying briefly.
 *
 * The preflight now waits for its probe child to exit before returning, which
 * removes the main cause of `EBUSY: resource busy or locked, rmdir` on Windows.
 * A shorter window still exists: antivirus and the search indexer open handles
 * on freshly written files after the writer closes them, and `rm --force` only
 * ignores `ENOENT`. Retrying keeps a filesystem race from being reported as a
 * preflight defect.
 */
async function removeTempDirectory(directory, attempts = 5) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt >= attempts || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) throw error
      await new Promise(resolve => setTimeout(resolve, 50 * attempt))
    }
  }
}


test('the pinned MCP launcher requests a supported Python interpreter', () => {
  assert.deepEqual(FLAGQUANTUM_MCP_ARGS, [
    ...FLAGQUANTUM_MCP_TORCH_ARGS, '--python', '3.12', '--from', 'flagquantum-mcp-server==0.3.2', 'flagquantum-mcp-server',
  ])
  assert.deepEqual(FLAGQUANTUM_MCP_INSTALL_ARGS, [
    'tool', 'install', ...FLAGQUANTUM_MCP_TORCH_ARGS, '--python', FLAGQUANTUM_MCP_PYTHON, FLAGQUANTUM_MCP_PACKAGE,
  ])
  assert.deepEqual(FLAGQUANTUM_MCP_TORCH_ARGS, process.platform === 'linux' ? ['--torch-backend', 'cpu'] : [])
  assert.equal(FLAGQUANTUM_MCP_INSTALL_ID, process.platform === 'linux'
    ? `${FLAGQUANTUM_MCP_PACKAGE}|torch=cpu` : FLAGQUANTUM_MCP_PACKAGE)
  assert.equal(heavyweightMcpLifecyclePolicy('flagquantum').packageSpec, FLAGQUANTUM_MCP_PACKAGE,
    'local server preparation and native CLI must pin the same MCP distribution')
})

test('a managed MCP runs without uv cache discovery or package resolution', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-managed-quantum-'))
  try {
    const env = { ...process.env, FLAGQAI_MANAGED_MCP_EXECUTABLE: process.execPath, UV_CACHE_DIR: 'relative-cache' }
    const result = await preflightFlagQuantum({ cwd, env, args: [fixture], task: 'Simulate a Bell circuit',
      probeCacheDir: () => { throw new Error('managed launch must not inspect uv cache') } })
    assert.equal(result.status, 'ready')
    assert.deepEqual(result.uvCache, { status: 'not-required' })
  } finally { await removeTempDirectory(cwd) }
})

test('pinned quantum preflight discovers task capabilities before model startup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-check-'))
  try {
    const env = { ...process.env }
    delete env.UV_CACHE_DIR
    const cache = join(cwd, 'uv-cache')
    const options = { cwd, command: process.execPath, args: [fixture], env, probeCacheDir: () => cache }
    const progress = []
    const result = await preflightFlagQuantum({ ...options, task: 'Solve the VQE ground state', onProgress: stage => progress.push(stage) })
    assert.deepEqual(progress, ['mcp-starting', 'mcp-initialized', 'tools-discovered', 'runtime-verified'])
    assert.deepEqual(result.requiredTools, ['train_parameters_tool'])
    assert.deepEqual(result.capability, { id: 'vqe', primaryTool: 'train_parameters_tool' })
    assert.equal(result.toolCount, 2)
    assert.equal(result.pythonVersion, '3.12')
    assert.deepEqual(result.uvCache, { status: 'writable', path: cache })
    assert.deepEqual(result.serverInfo, { name: 'flagquantum-test', version: '1' })
    assert.deepEqual(result.discoveredTools, ['simulate_circuit_tool', 'train_parameters_tool'])
    assert.deepEqual(result.runtimeChecks, ['simulate_circuit_tool', 'train_parameters_tool'])
    assert.equal(result.toolUseObserved, false)
    assert.equal(result.scientificResultValidated, null)
    const interactive = await preflightFlagQuantum(options)
    assert.deepEqual(interactive.capability, { id: 'interactive', primaryTool: 'simulate_circuit_tool' })
    assert.deepEqual(interactive.requiredTools, ['simulate_circuit_tool', 'train_parameters_tool'])
    assert.deepEqual(interactive.runtimeChecks, ['simulate_circuit_tool', 'train_parameters_tool'])
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...env, FQ_TEST_MODE: 'missing-vqe' } }),
      error => error.code === 'required_tool_missing' && /train_parameters_tool/u.test(error.message))
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...env, FQ_TEST_MODE: 'failed-training' } }),
      error => error.code === 'vqe_runtime_unavailable')
    await assert.rejects(preflightFlagQuantum({ ...options, task: 'VQE', env: { ...env, FQ_TEST_MODE: 'missing-vqe' } }), /lacks required task tools: train_parameters_tool/u)
    const generic = await preflightFlagQuantum({ ...options, task: 'Simulate a Bell circuit', env: { ...env, FQ_TEST_MODE: 'missing-vqe' } })
    assert.deepEqual(generic.requiredTools, ['simulate_circuit_tool'])
    assert.deepEqual(generic.capability, { id: 'circuit-simulation', primaryTool: 'simulate_circuit_tool' })
    assert.deepEqual(generic.runtimeChecks, ['simulate_circuit_tool'])
    await assert.rejects(preflightFlagQuantum({ ...options, task: 'VQE', env: { ...env, FQ_TEST_MODE: 'failed-simulation' } }), /simulation failed during preflight/u)
    await assert.rejects(preflightFlagQuantum({ ...options, task: 'VQE', env: { ...env, FQ_TEST_MODE: 'incorrect-simulation' } }), /failed the Bell-state preflight/u)
    await assert.rejects(preflightFlagQuantum({ ...options, task: 'VQE', env: { ...env, FQ_TEST_MODE: 'failed-training' } }),
      error => error.code === 'vqe_runtime_unavailable')
    await assert.rejects(preflightFlagQuantum({ ...options, task: 'VQE', env: { ...env, FQ_TEST_MODE: 'invalid-training' } }),
      error => error.code === 'vqe_runtime_unavailable')
  } finally { await removeTempDirectory(cwd) }
})

test('a stalled MCP reports a bounded timeout without claiming tool readiness', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-timeout-'))
  try {
    const progress = []
    await assert.rejects(preflightFlagQuantum({
      cwd, task: 'VQE', command: process.execPath, args: [fixture],
      env: { ...process.env, FQ_TEST_MODE: 'stalled-initialize' },
      probeCacheDir: () => join(cwd, 'uv-cache'), timeoutMs: 100,
      onProgress: stage => progress.push(stage),
    }), error => error.code === 'mcp_timeout' && /no model request was sent/u.test(error.message))
    assert.deepEqual(progress, ['mcp-starting'])
  } finally { await removeTempDirectory(cwd) }
})

test('non-object MCP messages reject preflight and stop the child without an uncaught exception', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-envelope-'))
  try {
    for (const message of [null, true, 7, 'noise', []]) {
      let child
      const progress = []
      await assert.rejects(preflightFlagQuantum({
        cwd, command: process.execPath,
        args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(message) + '\n')}); setInterval(() => {}, 1000)`],
        env: { ...process.env, UV_CACHE_DIR: join(cwd, 'cache') }, timeoutMs: 2000,
        spawnProcess: (...args) => { child = spawn(...args); return child },
        onProgress: stage => progress.push(stage),
      }), /invalid protocol message/u)
      assert.ok(child?.killed, 'malformed messages must stop the preflight child')
      assert.deepEqual(progress, ['mcp-starting'], 'malformed messages cannot claim readiness')
    }
  } finally { await removeTempDirectory(cwd) }
})

test('uvx refuses a nearly full cache volume before starting MCP', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-disk-'))
  try {
    const env = { ...process.env, UV_CACHE_DIR: join(cwd, 'cache'),
      UV_TOOL_DIR: join(cwd, 'tools'), UV_PYTHON_INSTALL_DIR: join(cwd, 'python') }
    let starts = 0
    await assert.rejects(preflightFlagQuantum({
      cwd, env, task: 'VQE', command: 'uvx',
      probeFreeBytes: async () => 1024 ** 3,
      spawnProcess: () => { starts += 1; throw new Error('MCP must not start') },
    }), error => error.code === 'insufficient_disk_space'
      && /UV_CACHE_DIR/u.test(error.message) && /no model request was sent/u.test(error.message))
    assert.equal(starts, 0)
    for (const variable of ['UV_TOOL_DIR', 'UV_PYTHON_INSTALL_DIR']) {
      await assert.rejects(preflightFlagQuantum({
        cwd, env, task: 'VQE', command: 'uvx',
        probeFreeBytes: async directory => directory === env[variable] ? 1024 ** 3 : 3 * 1024 ** 3,
        spawnProcess: () => { starts += 1; throw new Error('MCP must not start') },
      }), error => error.code === 'insufficient_disk_space' && error.message.includes(variable))
    }
    assert.equal(starts, 0)
  } finally { await removeTempDirectory(cwd) }
})

test('uvx can inspect real free space on each effective writable directory', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-statfs-'))
  try {
    const env = { ...process.env, UV_CACHE_DIR: join(cwd, 'cache'),
      UV_TOOL_DIR: join(cwd, 'tools'), UV_PYTHON_INSTALL_DIR: join(cwd, 'python') }
    const result = await preflightFlagQuantum({
      cwd, env, task: 'VQE', command: 'uvx', minimumFreeBytes: 0,
      spawnProcess: (_command, _args, options) => spawn(process.execPath, [fixture], options),
    })
    assert.equal(result.status, 'ready')
  } finally { await removeTempDirectory(cwd) }
})

test('uvx stops an active cold install if a monitored volume runs low', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-disk-running-'))
  let child
  try {
    const env = { ...process.env, UV_CACHE_DIR: join(cwd, 'cache'),
      UV_TOOL_DIR: join(cwd, 'tools'), UV_PYTHON_INSTALL_DIR: join(cwd, 'python') }
    let reads = 0
    await assert.rejects(preflightFlagQuantum({
      cwd, env, task: 'VQE', command: 'uvx', timeoutMs: 2000, diskCheckIntervalMs: 10,
      probeFreeBytes: async () => ++reads <= 3 ? 3 * 1024 ** 3 : 1024 ** 3,
      spawnProcess: (_command, _args, options) => {
        child = spawn(process.execPath, [fixture], {
          ...options, env: { ...options.env, FQ_TEST_MODE: 'stalled-initialize' },
        })
        return child
      },
    }), error => error.code === 'insufficient_disk_space'
      && /UV_CACHE_DIR/u.test(error.message) && /no model request was sent/u.test(error.message))
    assert.ok(child?.killed, 'the active MCP installer is stopped at the disk floor')
  } finally {
    child?.kill()
    await removeTempDirectory(cwd)
  }
})

test('molecular VQE requires and exercises the six-tool research contract', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-research-check-'))
  try {
    const task = '计算 H2 基态能量，用 VQE'
    const options = { cwd, task, command: process.execPath, args: [fixture],
      env: { ...process.env }, probeCacheDir: () => join(cwd, 'uv-cache') }
    assert.deepEqual(quantumCapabilityFor(task), {
      id: 'research-ground-state', primaryTool: 'execute_local_capability_tool',
    })
    assert.equal(requiredQuantumTools(task).length, 6)
    await assert.rejects(preflightFlagQuantum(options),
      error => error.code === 'required_tool_missing' && /execute_local_capability_tool/u.test(error.message))
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...options.env, FQ_TEST_MODE: 'research-missing' } }),
      error => error.code === 'required_tool_missing' && /execute_local_capability_tool/u.test(error.message))
    const ready = await preflightFlagQuantum({ ...options, env: { ...options.env, FQ_TEST_MODE: 'research-good' } })
    assert.equal(ready.status, 'ready')
    assert.equal(ready.capability.id, 'research-ground-state')
    assert.deepEqual(ready.requiredTools, [
      'search_capabilities_tool', 'describe_capability_tool', 'validate_capability_input_tool',
      'estimate_capability_tool', 'execute_local_capability_tool', 'validate_evidence_tool',
    ])
    assert.ok(ready.runtimeChecks.includes('validate_evidence_tool'))
    assert.equal(ready.toolUseObserved, false, 'a preflight probe is not a user session tool call')
    assert.equal(ready.scientificResultValidated, null, 'a probe is not validation of the user task')
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...options.env, FQ_TEST_MODE: 'research-bad-energy' } }),
      error => error.code === 'research_runtime_unavailable' && /independent energy/u.test(error.message))
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...options.env, FQ_TEST_MODE: 'research-missing-energy' } }),
      error => error.code === 'research_runtime_unavailable' && /independent energy/u.test(error.message))
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...options.env, FQ_TEST_MODE: 'research-bad-validation' } }),
      error => error.code === 'research_runtime_unavailable' && /did not validate/u.test(error.message))
  } finally { await removeTempDirectory(cwd) }
})

test('unwritable or missing workspace fails before MCP startup', async () => {
  await assert.rejects(preflightFlagQuantum({ cwd: join(tmpdir(), 'flagqai-missing-workspace', 'never-created'), command: process.execPath, args: [fixture] }), error => error.code === 'workspace_not_writable')
  assert.deepEqual(requiredQuantumTools('变分基态求解'), ['train_parameters_tool'])
  assert.deepEqual(requiredQuantumTools(), ['simulate_circuit_tool', 'train_parameters_tool'])
  assert.deepEqual(quantumCapabilityFor('Simulate a Bell state'), { id: 'circuit-simulation', primaryTool: 'simulate_circuit_tool' })
})

test('file-data or sync failures in each runtime directory stop before MCP startup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-quota-'))
  try {
    const env = { ...process.env,
      UV_CACHE_DIR: join(cwd, 'cache'),
      UV_TOOL_DIR: join(cwd, 'tools'),
      UV_PYTHON_INSTALL_DIR: join(cwd, 'python'),
    }
    for (const [failedProbe, code] of [
      [1, 'workspace_not_writable'], [2, 'cache_not_writable'],
      [3, 'tool_dir_not_writable'], [4, 'python_dir_not_writable'],
    ]) {
      let probes = 0
      await assert.rejects(preflightFlagQuantum({
        cwd, env, task: 'VQE', command: 'uvx',
        probeWrite: async () => {
          if (++probes === failedProbe) throw Object.assign(new Error('disk quota exceeded'), { code: 'ENOSPC' })
        },
        spawnProcess: () => { throw new Error('MCP must not start after a failed write probe') },
      }), error => error.code === code)
      assert.equal(probes, failedProbe)
    }
  } finally { await removeTempDirectory(cwd) }
})

test('unmatched scientific tasks fail before workspace or MCP setup', async () => {
  await assert.rejects(preflightFlagQuantum({
    task: 'Optimize a quantum chemistry molecular geometry',
    cwd: join(tmpdir(), 'flagqai-missing-workspace', 'never-created'),
    spawnProcess: () => { throw new Error('MCP must not start for an unsupported task') },
  }), error => error.code === 'unsupported_quantum_task')
  assert.throws(() => requiredQuantumTools('Optimize a quantum chemistry molecular geometry'),
    error => error.code === 'unsupported_quantum_task')
})

test('an explicit uv cache is verified before contacting MCP', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-cache-'))
  try {
    const cache = join(cwd, 'uv-cache')
    const options = { cwd, command: process.execPath, args: [fixture], task: 'VQE', probeCacheDir: () => { throw new Error('explicit cache must skip discovery') } }
    const ready = await preflightFlagQuantum({ ...options, env: { ...process.env, UV_CACHE_DIR: cache } })
    assert.deepEqual(ready.uvCache, { status: 'writable', path: cache })
    const blocked = join(cwd, 'file-not-directory')
    await writeFile(blocked, 'x')
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...process.env, UV_CACHE_DIR: blocked } }), error => error.code === 'cache_not_writable')
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...process.env, UV_CACHE_DIR: 'relative-cache' } }), error => error.code === 'cache_path_not_absolute')
  } finally { await removeTempDirectory(cwd) }
})

test('default uv cache lookup and writes fail before MCP startup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-default-cache-'))
  try {
    const env = { ...process.env }
    delete env.UV_CACHE_DIR
    const blocked = join(cwd, 'file-not-directory')
    await writeFile(blocked, 'x')
    const options = { cwd, env, command: process.execPath, args: [fixture], task: 'VQE',
      spawnProcess: () => { throw new Error('MCP must not start before cache preflight') } }
    await assert.rejects(preflightFlagQuantum({ ...options, probeCacheDir: () => blocked }),
      error => error.code === 'cache_not_writable')
    await assert.rejects(preflightFlagQuantum({ ...options, probeCacheDir: () => { throw new Error('uv failed') } }),
      error => error.code === 'cache_discovery_failed')
    await assert.rejects(preflightFlagQuantum({ ...options, probeCacheDir: () => 'relative-cache' }),
      error => error.code === 'cache_path_not_absolute')
  } finally { await removeTempDirectory(cwd) }
})

test('uvx rejects unwritable tool and Python directories before MCP startup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-uv-dirs-'))
  try {
    const blocked = join(cwd, 'file-not-directory')
    await writeFile(blocked, 'x')
    const env = { ...process.env, UV_CACHE_DIR: join(cwd, 'cache') }
    delete env.UV_TOOL_DIR
    delete env.UV_PYTHON_INSTALL_DIR
    const options = { cwd, command: 'uvx', task: 'VQE',
      env,
      spawnProcess: () => { throw new Error('MCP must not start before uv directory checks') },
      probeUvDir: kind => join(cwd, kind),
    }
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...options.env, UV_TOOL_DIR: blocked } }),
      error => error.code === 'tool_dir_not_writable' && /UV_TOOL_DIR/u.test(error.message))
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...options.env, UV_TOOL_DIR: 'relative-tool' } }),
      error => error.code === 'tool_path_not_absolute')
    await assert.rejects(preflightFlagQuantum({ ...options, env: { ...options.env, UV_TOOL_DIR: join(cwd, 'tool'), UV_PYTHON_INSTALL_DIR: blocked } }),
      error => error.code === 'python_dir_not_writable' && /UV_PYTHON_INSTALL_DIR/u.test(error.message))
    await assert.rejects(preflightFlagQuantum({ ...options, probeUvDir: () => { throw new Error('uv failed') } }),
      error => error.code === 'tool_discovery_failed')
  } finally { await removeTempDirectory(cwd) }
})

test('machine-readable preflight failure is structured and does not start a model', async () => {
  const command = fileURLToPath(new URL('../bin/flagqai.js', import.meta.url))
  const result = spawnSync(process.execPath, [command, 'quantum', '--check', '--json', 'VQE'], {
    // This check exercises preflight error reporting, not first-run setup.
    // An explicit DSH_HOME bypasses the managed installation readiness check
    // in isolated CI HOME directories, without starting a model.
    cwd: process.cwd(), env: { ...process.env, DSH_HOME: process.cwd(), UV_CACHE_DIR: 'relative-cache' }, encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.equal(result.stderr, '')
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'failed')
  assert.equal(report.error.code, 'cache_path_not_absolute')
  const cwd = await mkdtemp(join(tmpdir(), 'flagqai-quantum-json-'))
  try {
    const blocked = join(cwd, 'blocked-tool-dir')
    await writeFile(blocked, 'x')
    const toolFailure = spawnSync(process.execPath, [command, 'quantum', '--check', '--json', 'VQE'], {
      cwd, env: { ...process.env, DSH_HOME: cwd, UV_CACHE_DIR: join(cwd, 'cache'), UV_TOOL_DIR: blocked }, encoding: 'utf8',
    })
    assert.equal(toolFailure.status, 1)
    assert.equal(toolFailure.stderr, '')
    assert.equal(JSON.parse(toolFailure.stdout).error.code, 'tool_dir_not_writable')
  } finally { await removeTempDirectory(cwd) }
})
