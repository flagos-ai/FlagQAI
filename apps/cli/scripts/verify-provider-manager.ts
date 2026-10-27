import assert from 'node:assert/strict'
import type { ProviderSetupHost } from '../src/adapter/ports/channel-settings.js'
import { createProviderManager } from '../lib/types/dsh-adapter/provider-manager.js'
import { createSettingsHosts } from '../src/dsh-adapter/channel/settings-host.js'
import type { Context } from '@deepseek-ai/cordis'

const credentials = new Map<string, string>()
const profiles = new Map<string, Record<string, unknown>>()
const selections: { provider: string; model: string }[] = []
let failProfile = false

const host: ProviderSetupHost = {
  listCatalogProviders: () => [{ provider: 'deepseek', displayName: 'DeepSeek' }],
  listConfiguredProviders: () => [...profiles].map(([route, profile]) => ({
    route,
    ref: String(profile.apiKeyEnv ?? ''),
    shadowed: false,
    isCatalog: route === 'deepseek',
    modelEntries: Array.isArray(profile.models) ? profile.models as Record<string, unknown>[] : [],
    baseURL: typeof profile.baseURL === 'string' ? profile.baseURL : undefined,
    api: typeof profile.api === 'string' ? profile.api : undefined,
    models: Array.isArray(profile.models)
      ? profile.models.flatMap(model => typeof model === 'object' && model !== null && typeof (model as { id?: unknown }).id === 'string'
        ? [(model as { id: string }).id]
        : [])
      : [],
  })),
  listRefUsers: () => [],
  routeExists: route => profiles.has(route),
  discoverModels: async request => {
    if (request.provider === 'gateway') {
      assert.equal(request.baseURL, 'https://gateway.example/v1')
      assert.equal(request.api, 'openai-completions')
      assert.equal(request.apiKey, undefined)
    }
    return request.provider === 'deepseek'
      ? [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }]
      : [{ id: 'gateway-model', name: 'Gateway Model' }]
  },
  envShadows: () => false,
  envValue: () => undefined,
  readCredential: async ref => credentials.get(ref),
  writeCredential: (ref, value) => { credentials.set(ref, value) },
  removeCredential: ref => { credentials.delete(ref) },
  async writeProfile(route, profile) {
    if (failProfile) throw new Error('profile rejected')
    profiles.set(route, profile)
  },
  async mutateProfile(route, ops) {
    if (failProfile) throw new Error('profile rejected')
    const profile = profiles.get(route)!
    for (const op of ops) {
      if (op.op === 'set') profile[op.path[0]!] = op.value
      else delete profile[op.path[0]!]
    }
  },
  async removeProfile(route) { profiles.delete(route) },
}

const manager = await createProviderManager(host, (provider, model) => {
  selections.push({ provider, model })
  return true
})

assert.equal((await manager.status()).ready, false)
profiles.set('gateway-without-key', {
  apiKeyEnv: 'GATEWAY_WITHOUT_KEY_API_KEY',
  models: [{ id: 'gateway-model' }],
})
assert.equal((await manager.status()).ready, false)
profiles.delete('gateway-without-key')
assert.deepEqual(await manager.discover({
  kind: 'catalog',
  route: 'deepseek',
  baseURL: 'https://gateway.example/v1',
  api: 'openai-completions',
  apiKey: 'discovery-only',
}), [
  { id: 'gateway-model', name: 'Gateway Model' },
])

assert.deepEqual(await manager.configure({
  kind: 'catalog',
  route: 'deepseek',
  apiKey: 'stored-secret',
  models: ['deepseek-chat'],
}), { route: 'deepseek', model: 'deepseek-chat', keyConfigured: true })
assert.equal(credentials.get('DEEPSEEK_API_KEY'), 'stored-secret')
assert.deepEqual(selections, [{ provider: 'deepseek', model: 'deepseek-chat' }])
const status = await manager.status()
assert.equal(status.ready, true)
assert.equal(JSON.stringify(status).includes('stored-secret'), false)

profiles.set('deepseek', { ...profiles.get('deepseek'), timeoutMs: 1234, models: [{ id: 'deepseek-chat', contextWindow: 123 }] })
await manager.configure({ kind: 'catalog', route: 'deepseek', models: ['deepseek-chat', 'another'] })
assert.equal(profiles.get('deepseek')!.timeoutMs, 1234)
assert.deepEqual(profiles.get('deepseek')!.models, [{ id: 'deepseek-chat', contextWindow: 123 }, { id: 'another' }])
assert.equal((await manager.status()).configured[0]!.keyConfigured, true)
assert.equal(credentials.get('DEEPSEEK_API_KEY'), 'stored-secret')
credentials.set('GATEWAY_API_KEY', 'previous-secret')
failProfile = true
await assert.rejects(manager.configure({
  kind: 'custom',
  route: 'gateway',
  baseURL: 'https://gateway.example/v1',
  api: 'openai-completions',
  apiKey: 'replacement-secret',
  models: ['gateway-model'],
}), /profile rejected/)
assert.equal(credentials.get('GATEWAY_API_KEY'), 'previous-secret')

failProfile = false
profiles.set('gateway', { apiKeyEnv: 'CUSTOM_REFERENCE', baseURL: 'https://gateway.example/v1', api: 'openai-completions', headers: { 'x-account': 'preserved' }, models: [{ id: 'gateway-model', maxTokens: 1000 }] })
credentials.set('CUSTOM_REFERENCE', 'original-key')
await manager.configure({ kind: 'custom', route: 'gateway', baseURL: 'https://gateway.example/v1', api: 'openai-completions', models: ['gateway-model'] })
assert.equal(profiles.get('gateway')!.apiKeyEnv, 'CUSTOM_REFERENCE')
assert.equal(credentials.get('CUSTOM_REFERENCE'), 'original-key')
assert.deepEqual(profiles.get('gateway')!.headers, { 'x-account': 'preserved' })
assert.deepEqual(profiles.get('gateway')!.models, [{ id: 'gateway-model', maxTokens: 1000 }])
assert.equal((await manager.discover({ kind: 'custom', route: 'gateway', baseURL: 'https://gateway.example/v1', api: 'openai-completions' })).length, 1)

const namespace = 'custom-llm-mount'
const effective = { providers: { inherited: { apiKeyEnv: 'INHERITED_KEY', models: [{ id: 'model' }] } } }
const services: Record<string, unknown> = {
  settings: { describe: () => [{ ns: namespace, value: effective, user: {}, revision: 1 }] },
  credentials: { resolve: async () => undefined },
  llm: {
    listConfigurableProviders: () => [{ settingsNs: namespace, provider: 'inherited', declared: true }],
    discoverModels: async (ns: string) => { assert.equal(ns, namespace); return [] },
  },
}
const mounted = createSettingsHosts({ get: (id: string) => services[id] } as unknown as Context).providerSetup()!
assert.ok(mounted)
assert.deepEqual(mounted.listConfiguredProviders(), [])
assert.equal(mounted.listConfiguredProviders({ effective: true })[0]!.route, 'inherited')
await mounted.discoverModels({ provider: 'inherited' })
console.log('PASS Provider Manager shares Harness settings, stores secrets write-only, and rolls back failed profiles')
