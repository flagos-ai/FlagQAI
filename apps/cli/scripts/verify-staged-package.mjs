import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packFlagqai } from './pack-flagqai.mjs'
import { verifyBundledNotices } from './bundled-notices.mjs'

// The first public source snapshot will not expose private review issues.
// User-facing entry docs and installed notices must explain their limits here.
const privateReviewLink = /https?:\/\/github\.com\/FlagQuantum\/FlagQAI-CLI(?:\/|#|$)/iu
for (const [name, url] of [
  ['root README', new URL('../../../README.md', import.meta.url)],
  ['CLI README', new URL('../README.md', import.meta.url)],
  ['CLI notices', new URL('../OPEN_SOURCE_NOTICES.md', import.meta.url)],
]) assert.doesNotMatch(readFileSync(url, 'utf8'), privateReviewLink,
  `${name} must explain release limits without a private issue link`)

const output = await mkdtemp(join(tmpdir(), 'flagqai-verify-package-'))
try {
  const report = await packFlagqai({ destination: output })
  const manifest = spawnSync('tar', ['-xOzf', report.path, 'package/package.json'], { encoding: 'utf8' })
  if (manifest.error || manifest.status !== 0) throw new Error(manifest.stderr || manifest.error?.message || 'Cannot inspect staged manifest')
  const stagedManifest = JSON.parse(manifest.stdout)
  const scientificHelper = spawnSync('tar', ['-xOzf', report.path, 'package/lib/flagqai-platform/scientific-core/python/flagqai_science.py'], { encoding: 'utf8' })
  if (scientificHelper.error || scientificHelper.status !== 0) throw new Error('Staged CLI package is missing the local scientific-run helper')
  assert.match(scientificHelper.stdout, /class ScientificRun/u)
  const vqeEvidence = spawnSync('tar', ['-xOzf', report.path, 'package/lib/flagqai-platform/scientific-core/vqe-numerical-evidence.mjs'], { encoding: 'utf8' })
  if (vqeEvidence.error || vqeEvidence.status !== 0) throw new Error('Staged CLI package is missing the VQE numerical evidence checker')
  assert.match(vqeEvidence.stdout, /two-qubit-parity-vqe-v1/u)
  const researchEvidence = spawnSync('tar', ['-xOzf', report.path, 'package/lib/flagqai-platform/scientific-core/research-vqe-numerical-evidence.mjs'], { encoding: 'utf8' })
  if (researchEvidence.error || researchEvidence.status !== 0) throw new Error('Staged CLI package is missing the research VQE numerical evidence checker')
  assert.match(researchEvidence.stdout, /two-qubit-weight-one-research-vqe-v1/u)
  assert.equal(stagedManifest.private, true, 'CLI must remain protected from publication while release gates are open')
  assert.deepEqual(Object.keys(stagedManifest.bin).sort(), ['flagqai', 'fq'], 'only the new commands may be installed')
  assert.equal(stagedManifest.dependencies['yoga-layout'], '3.2.1', 'the official Yoga runtime must be pinned in the installed CLI')
  assert.ok(!report.files.some(file => file.path.includes('native-ts/yoga-layout/')), 'the imported TypeScript Yoga port must not ship')
  assert.ok(!report.files.some(file => /^lib\/types\/(?:backends\/(?:claude|codex)\/|components\/SdkInstallWizard\.)/u.test(file.path)),
    'deferred backend or install-wizard output must not ship in the first CLI release')
  assert.ok(report.files.some(file => file.path === 'bin/native-launcher.js'), 'the renamed native launcher must ship')
  assert.ok(!report.files.some(file => file.path === 'bin/dsh-tui.js' || file.path.startsWith('guide/dsh-tui-guide/')), 'obsolete launchers and guide aliases must not ship')

  const runtimePins = spawnSync('tar', ['-xOzf', report.path, 'package/bin/runtime-profile-overrides.json'], { encoding: 'utf8' })
  if (runtimePins.error || runtimePins.status !== 0) throw new Error('Staged CLI package is missing the managed Harness peer pins')
  assert.equal(JSON.parse(runtimePins.stdout)['@deepseek-ai/dsh-scope'], '0.2.1-rc.2', 'installed profile must use the validated Harness cohort')
  assert.equal(stagedManifest.scripts.prepare, undefined, 'staged package must not require source-only prepare')
  assert.equal(stagedManifest.optionalDependencies.sharp, '0.35.4', 'image support must retain the reviewed optional sharp version')
  assert.ok(!stagedManifest.bundledDependencies.includes('sharp'), 'sharp must be installed from the registry, not bundled')
  assert.ok(!stagedManifest.bundledDependencies.some(name => name.startsWith('@img/')), '@img binaries must not be bundled')
  const notices = spawnSync('tar', ['-xOzf', report.path, 'package/OPEN_SOURCE_NOTICES.md'], { encoding: 'utf8' })
  if (notices.error || notices.status !== 0) throw new Error('Staged CLI package is missing source and distribution notices')
  assert.doesNotMatch(notices.stdout, privateReviewLink, 'Staged CLI notices depend on a private review link')
  const readme = spawnSync('tar', ['-xOzf', report.path, 'package/README.md'], { encoding: 'utf8' })
  if (readme.error || readme.status !== 0) throw new Error('Staged CLI package is missing its user README')
  assert.doesNotMatch(readme.stdout, privateReviewLink, 'Staged CLI README depends on a private review link')
  for (const source of [
    'sharp@0.35.4',
    '@img/sharp-wasm32@0.35.4',
    'github.com/lovell/sharp/tree/v0.35.4',
    'github.com/lovell/sharp-libvips/tree/v1.3.3',
    'github.com/lovell/sharp-libvips/blob/v1.3.3/THIRD-PARTY-NOTICES.md',
  ]) assert.ok(notices.stdout.includes(source), `Staged notices omit optional image dependency source: ${source}`)
  const quantumPreflight = spawnSync('tar', ['-xOzf', report.path, 'package/bin/quantum-preflight.js'], { encoding: 'utf8' })
  if (quantumPreflight.error || quantumPreflight.status !== 0) throw new Error('Staged CLI package is missing the quantum preflight')
  const quantumProfile = spawnSync('tar', ['-xOzf', report.path, 'package/bin/quantum-mcp-profile.js'], { encoding: 'utf8' })
  if (quantumProfile.error || quantumProfile.status !== 0) throw new Error('Staged CLI package is missing the pinned quantum MCP launcher profile')
  assert.match(quantumProfile.stdout, /flagquantum-mcp-server==0\.3\.2/u, 'installed CLI must contain the reviewed MCP pin')
  const quantumCapability = spawnSync('tar', ['-xOzf', report.path, 'package/bin/quantum-capability.js'], { encoding: 'utf8' })
  if (quantumCapability.error || quantumCapability.status !== 0) throw new Error('Staged CLI package is missing quantum capability policy')
  assert.match(quantumCapability.stdout, /recognizedQuantumCalculation/u, 'installed CLI must include shared calculation intent')
  assert.match(quantumCapability.stdout, /research-ground-state/u, 'installed CLI must distinguish molecular research tasks')
  assert.match(quantumPreflight.stdout, /execute_local_capability_tool/u, 'installed CLI must probe local research execution')
  assert.equal(stagedManifest.imports['#flagqai/quantum-preflight'].default, './bin/quantum-preflight.js')
  assert.equal(stagedManifest.imports['#flagqai/quantum-mcp-profile'].default, './bin/quantum-mcp-profile.js')
  assert.equal(stagedManifest.imports['#flagqai/quantum-capability'].default, './bin/quantum-capability.js')
  const inputGuard = spawnSync('tar', ['-xOzf', report.path, 'package/lib/types/dsh-adapter/channel/input-delivery.js'], { encoding: 'utf8' })
  if (inputGuard.error || inputGuard.status !== 0) throw new Error('Staged CLI package is missing the native input-delivery guard')
  assert.match(inputGuard.stdout, /guardFlagQuantumInput/u, 'installed CLI must gate later molecular input before Harness delivery')
  const progressPolicy = spawnSync('tar', ['-xOzf', report.path, 'package/lib/types/dsh-adapter/task-progress-policy.js'], { encoding: 'utf8' })
  if (progressPolicy.error || progressPolicy.status !== 0) throw new Error(progressPolicy.stderr || progressPolicy.error?.message || 'CLI package is missing task-progress guidance')
  assert.match(progressPolicy.stdout, /Do not wait for the user to request a plan/u, 'CLI package must include proactive Todo guidance')
  assert.match(progressPolicy.stdout, /For each new nontrivial user request/u, 'CLI package must guide a fresh Todo list for subsequent tasks')
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-package.mjs', import.meta.url))], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    input: JSON.stringify([report]),
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
} finally {
  await rm(output, { recursive: true, force: true })
}
