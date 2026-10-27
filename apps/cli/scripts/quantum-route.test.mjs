import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { automaticQuantumTask, defaultQuantumSession, recognizedQuantumCalculation } from '../bin/quantum-route.js'
import { recognizedQuantumCalculation as policyCalculation } from '../bin/quantum-capability.js'

test('new native sessions mount quantum by default without changing utility or resume commands', () => {
  assert.equal(defaultQuantumSession([], {}), true)
  assert.equal(defaultQuantumSession(['Review the README'], {}), true)
  assert.equal(defaultQuantumSession(['--', 'Explain VQE'], {}), true)
  for (const args of [['quantum'], ['setup'], ['doctor'], ['serve'], ['attach'],
    ['run', 'task'], ['--help'], ['--resume', 'session-id']]) {
    assert.equal(defaultQuantumSession(args, {}), false, args.join(' '))
  }
  assert.equal(defaultQuantumSession([], { FLAGQAI_PRESET: 'standard' }), false)
  assert.equal(defaultQuantumSession([], { FLAGQAI_BACKEND: 'claude' }), false)
  assert.equal(defaultQuantumSession([], { FLAGQAI_ENABLE_FLAGQUANTUM_MCP: '0' }), false)
  assert.equal(defaultQuantumSession([], { FLAGQAI_PRESET: 'flagquantum' }), true)
})

test('interactive and startup route use the same calculation intent', () => {
  assert.equal(recognizedQuantumCalculation, policyCalculation, 'CLI keeps the existing export without owning task policy')
  assert.equal(recognizedQuantumCalculation('计算两量子比特的基态能量'), true)
  assert.equal(recognizedQuantumCalculation('算H2基态能量'), true)
  assert.equal(recognizedQuantumCalculation('算 H₂ 基态能量'), true)
  assert.equal(recognizedQuantumCalculation('算一下代码里 H2 的 bug'), false)
  assert.equal(recognizedQuantumCalculation('Solve a two-qubit VQE ground state'), true)
  assert.equal(recognizedQuantumCalculation('Calculate a VQE ground state and save the result to a file'), true)
  assert.equal(recognizedQuantumCalculation('Simulate a Bell state and write the result to a JSON file'), true)
  assert.equal(recognizedQuantumCalculation('Find the VQE file'), false)
  assert.equal(recognizedQuantumCalculation('Run the VQE code and save output to a file'), false)
  assert.equal(recognizedQuantumCalculation('Fix the VQE parser bug'), false)
  assert.equal(recognizedQuantumCalculation('Explain VQE'), false)
})

test('only clear startup calculation tasks choose the pinned quantum route', () => {
  assert.equal(automaticQuantumTask(['Solve a two-qubit VQE ground state'], {}), 'Solve a two-qubit VQE ground state')
  assert.equal(automaticQuantumTask(['--', 'Simulate a Bell state and measure probabilities'], {}), 'Simulate a Bell state and measure probabilities')
  assert.equal(automaticQuantumTask(['计算两量子比特的基态能量'], {}), '计算两量子比特的基态能量')
  assert.equal(automaticQuantumTask(['计算 H2 基态能量，用 VQE'], {}), '计算 H2 基态能量，用 VQE')
  assert.equal(automaticQuantumTask(['算H2基态能量'], {}), '算H2基态能量')
  assert.equal(automaticQuantumTask(['Calculate a VQE ground state and save the result to a file'], {}),
    'Calculate a VQE ground state and save the result to a file')
  for (const args of [[], ['--help'], ['serve'], ['quantum', '--check', 'VQE'], ['Explain VQE'],
    ['Fix the VQE parser bug'], ['Review quantum circuit code'], ['Find the Hamiltonian parser bug'],
    ['计算量子电路测试失败的原因'], ['Solve a sorting problem'],
    ['serve', 'Simulate a Bell state'], ['attach', 'Solve VQE'], ['safe', 'Solve VQE'],
    ['--resume', 'session-id', 'Solve VQE']]) {
    assert.equal(automaticQuantumTask(args, {}), null, args.join(' '))
  }
  assert.equal(automaticQuantumTask(['Solve VQE'], { FLAGQAI_PRESET: 'standard' }), null)
  assert.equal(automaticQuantumTask(['Solve VQE'], { FLAGQAI_BACKEND: 'claude' }), null)
  assert.equal(automaticQuantumTask(['Solve VQE'], { FLAGQAI_ENABLE_FLAGQUANTUM_MCP: '0' }), null)
})

test('an automatically routed startup task fails preflight before model inference', () => {
  const entry = fileURLToPath(new URL('../bin/flagqai.js', import.meta.url))
  const run = spawnSync(process.execPath, [entry, 'Solve a two-qubit VQE ground state'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, DSH_HOME: process.cwd(), UV_CACHE_DIR: 'relative-cache' },
  })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /uv cache directory must be an absolute path/u)
  assert.doesNotMatch(run.stderr, /Provider|model request/u)
})

test('bare flagqai and ordinary startup prompts preflight before any model request', () => {
  const entry = fileURLToPath(new URL('../bin/flagqai.js', import.meta.url))
  for (const args of [[], ['Review the README']]) {
    const run = spawnSync(process.execPath, [entry, ...args], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
      env: { ...process.env, DSH_HOME: process.cwd(), UV_CACHE_DIR: 'relative-cache' },
    })
    assert.equal(run.status, 1, args.join(' '))
    assert.match(run.stderr, /uv cache directory must be an absolute path/u)
    assert.doesNotMatch(run.stderr, /Provider|model request/u)
  }
})
