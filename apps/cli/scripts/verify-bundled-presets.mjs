/** Registry bridge regression, including relocated assets through the real Loader/Registry/Include. Run after build. */
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentPresetRegistry from '@deepseek-ai/dsh-agent-preset-registry'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { parse } from 'yaml'
import { settled } from './lib/term-test.mjs'
import { registerBundledPresets } from '../lib/types/dsh-adapter/bundled-presets.js'
import { initializeSessionPresets } from '../lib/types/dsh-adapter/session-bootstrap.js'
import { composePreset } from '../lib/types/dsh-adapter/presets.js'
import { FLAGQUANTUM_MCP_ARGS } from '../bin/quantum-preflight.js'

// Both frontends must compose tools before publishing a session. A modern
// empty/broken registry must never fall back to a host-only agent.
process.env.FLAGQAI_ENABLE_FLAGQUANTUM_MCP = '1'
const bootstrap = harness()
await initializeSessionPresets(bootstrap.ctx)
assert.deepEqual(bootstrap.registrations.map(row => row.definition.id),
  ['standard', 'ptc', 'minimal', 'cordis', 'liangshen', 'flagquantum'])
await assert.rejects(composePreset({ get: () => undefined }, undefined, true), /preset service is unavailable/)
await assert.rejects(composePreset({ get: () => ({
  async resolve() { throw new Error('missing standard') },
}) }, undefined, true), /preset.*unavailable/)
await assert.rejects(composePreset({ get: () => ({
  async resolve() { return { id: 'standard', broken: 'missing tool provider' } },
}) }, undefined, true), /preset.*unavailable/)
const mounted = []
const composition = await composePreset({ get: () => ({
  async resolve() { return { id: 'standard' } },
  async mount(ctx, id) { mounted.push({ ctx, id }) },
}) }, undefined, true)
const agentContext = {}
await composition.setup(agentContext)
assert.equal(composition.agentPreset, 'standard')
assert.deepEqual(mounted, [{ ctx: agentContext, id: 'standard' }])

function harness(declared = []) {
  const registrations = []
  const effects = []
  const disposed = []
  const makeContext = baseUrl => ({
    baseUrl,
    get(name) {
      if (name === 'loader') return { entries: () => declared }
      if (name === 'agentPresets') return {
        async register(definition) {
          registrations.push({ definition, baseUrl })
          return async () => { disposed.push(definition.id) }
        },
      }
    },
    extend({ baseUrl: next }) { return makeContext(next) },
    effect(effect) { effects.push(effect()) },
  })
  return { ctx: makeContext(new URL('../cordis.patch.yml', import.meta.url).href), registrations, effects, disposed }
}

assert.equal(await registerBundledPresets({ get: () => ({ list() {} }) }), false,
  'legacy directory discovery remains on its existing path')
delete process.env.FLAGQAI_ENABLE_FLAGQUANTUM_MCP
const ordinary = harness()
await registerBundledPresets(ordinary.ctx)
assert.deepEqual(ordinary.registrations.map(row => row.definition.id), ['standard', 'ptc', 'minimal', 'cordis', 'liangshen'],
  'normal startup must not eagerly connect or download optional quantum tooling')
process.env.FLAGQAI_ENABLE_FLAGQUANTUM_MCP = '1'
const fresh = harness()
assert.equal(await registerBundledPresets(fresh.ctx), true)
assert.deepEqual(fresh.registrations.map(row => row.definition.id), ['standard', 'ptc', 'minimal', 'cordis', 'liangshen', 'flagquantum'])
const standard = fresh.registrations[0]
assert.match(standard.baseUrl, /standard\.patch\.yml$/u)
assert.equal(typeof standard.definition.plugins.find(row => row.id === 'tool-bash').disabled.__jsExpr, 'string',
  'platform expressions must remain unevaluated for the upstream Loader')
const quantum = fresh.registrations.find(row => row.definition.id === 'flagquantum')
assert.equal(quantum.baseUrl, standard.baseUrl)
assert.deepEqual(quantum.definition.plugins.slice(0, -1), standard.definition.plugins,
  'quantum tools must preserve the full native Standard composition')
assert.deepEqual(quantum.definition.plugins.at(-1).config.args, FLAGQUANTUM_MCP_ARGS,
  'the native MCP launcher must match the Python and package verified before inference')
assert.equal(quantum.definition.plugins.at(-1).config.failOnStartupError, true)
process.env.FLAGQAI_MANAGED_MCP_EXECUTABLE = process.execPath
const managed = harness()
await registerBundledPresets(managed.ctx)
const managedMcp = managed.registrations.find(row => row.definition.id === 'flagquantum').definition.plugins.at(-1).config
assert.equal(managedMcp.command, process.execPath)
assert.deepEqual(managedMcp.args, [], 'installed sessions must not invoke uvx for MCP startup')
delete process.env.FLAGQAI_MANAGED_MCP_EXECUTABLE
const liangshen = fresh.registrations.find(row => row.definition.id === 'liangshen').definition
assert.equal(new URL(liangshen.plugins[0].config.path).protocol, 'file:')
assert.equal(fileURLToPath(liangshen.plugins[0].config.path), fileURLToPath(new URL('../presets/liangshen/agent.cordis.yml', import.meta.url)))
const metadata = parse(readFileSync(new URL('../presets/liangshen/preset.yml', import.meta.url), 'utf8'))
assert.deepEqual({ name: liangshen.name, description: liangshen.description, order: liangshen.order }, metadata)
for (const dispose of fresh.effects) await dispose()
assert.deepEqual(fresh.disposed, ['standard', 'ptc', 'minimal', 'cordis', 'liangshen', 'flagquantum'])

const mixed = harness(['standard', 'ptc', 'minimal', 'cordis', 'liangshen', 'flagquantum'].map(id => ({
  disabled: false, options: { name: '@deepseek-ai/dsh-agent-preset', config: { id } },
})))
assert.equal(await registerBundledPresets(mixed.ctx), true)
assert.deepEqual(mixed.registrations, [], 'profile declarations own their seats before activation completes')
const disabled = harness([{ disabled: true, options: { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard' } } }])
await registerBundledPresets(disabled.ctx)
assert.equal(disabled.registrations.length, 6)
// A real Cordis dependency appears after the TUI's registration attempt.
const delayed = new Context()
const delayedRegistrations = []
const delayedDisposals = []
try {
  delayed.baseUrl = new URL('../cordis.patch.yml', import.meta.url).href
  await registerBundledPresets(delayed)
  assert.equal(delayedRegistrations.length, 0)
  await delayed.plugin(ctx => {
    ctx.provide('agentPresets', {
      async register(definition) {
        delayedRegistrations.push(definition.id)
        return async () => { delayedDisposals.push(definition.id) }
      },
    })
  })
  assert.ok(await settled(() => delayedRegistrations.length === 6), 'late registry must receive all bundled presets')
} finally {
  await delayed.fiber.dispose()
}
assert.deepEqual(delayedDisposals.sort(), ['cordis', 'flagquantum', 'liangshen', 'minimal', 'ptc', 'standard'])

// Relocate the unchanged production modules so asset paths contain URL-sensitive
// characters on every OS (and a drive letter on Windows). Keep this under the
// checkout so their normal package imports still resolve; no user profile is used.
// Sweep leftovers from earlier runs first: on Windows the imported module file
// can still be locked when the final rmSync runs (or the process was killed),
// and each run otherwise strands another `.preset-path # % 中文-*` here.
const checkoutRoot = fileURLToPath(new URL('..', import.meta.url))
for (const stale of readdirSync(checkoutRoot)) {
  if (stale.startsWith('.preset-path # % 中文-')) {
    try { rmSync(join(checkoutRoot, stale), { recursive: true, force: true }) } catch { /* still locked; next run retries */ }
  }
}
const relocatedRoot = mkdtempSync(join(checkoutRoot, '.preset-path # % 中文-'))
const runtime = new Context()
let mountedCount = 0
try {
  const modules = join(relocatedRoot, 'src', 'dsh-adapter')
  const assets = join(relocatedRoot, 'presets', 'liangshen')
  mkdirSync(modules, { recursive: true })
  mkdirSync(assets, { recursive: true })
  for (const name of ['bundled-presets.js', 'packaged-presets.js']) {
    copyFileSync(new URL(`../lib/types/dsh-adapter/${name}`, import.meta.url), join(modules, name))
  }
  // Different metadata makes a hard-coded copy fail, including name and order.
  const relocatedMetadata = { name: 'Relocated 梁神', description: 'Metadata from preset.yml', order: 17 }
  writeFileSync(join(assets, 'preset.yml'), JSON.stringify(relocatedMetadata))
  writeFileSync(join(assets, 'agent.cordis.yml'), '- id: fixture\n  name: cordis:fixture\n')
  const { registerBundledPresets: registerRelocated } = await import(pathToFileURL(join(modules, 'bundled-presets.js')).href)
  const relocated = harness()
  await registerRelocated(relocated.ctx)
  const definition = relocated.registrations.find(row => row.definition.id === 'liangshen').definition
  assert.equal(fileURLToPath(definition.plugins[0].config.path), join(assets, 'agent.cordis.yml'))

  runtime.baseUrl = new URL('../cordis.patch.yml', import.meta.url).href
  await runtime.plugin(Loader)
  await runtime.plugin(SessionProjectionRegistry)
  await runtime.plugin(AgentPresetRegistry, { default: 'liangshen' })
  runtime.loader.builtins.fixture = ctx => {
    mountedCount++
    ctx.effect(() => () => { mountedCount-- })
  }
  const dispose = await runtime.agentPresets.register(definition)
  assert.equal(mountedCount, 1, 'the real Include must open the asset and activate its child')
  assert.deepEqual(await runtime.agentPresets.list(), [{ id: 'liangshen', ...relocatedMetadata }],
    'registration resolving is insufficient: the preset must have no broken diagnostic')
  const document = await runtime.agentPresets.readDocument('liangshen')
  assert.equal(document.name, relocatedMetadata.name)
  assert.equal(document.description, relocatedMetadata.description)
  await dispose()
  assert.equal(mountedCount, 0, 'registry disposal unmounts the included child')
  assert.deepEqual(await runtime.agentPresets.list(), [])
} finally {
  await runtime.fiber.dispose()
  rmSync(relocatedRoot, { recursive: true, force: true })
}
console.log('bundled presets OK (official definitions, expressions, ownership, legacy, relocated Include, metadata, disposal)')
