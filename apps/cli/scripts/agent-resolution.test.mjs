import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const moduleUrl = process.env.FLAGQAI_RESOLUTION_TEST_PACKAGE_ROOT
  ? pathToFileURL(join(process.env.FLAGQAI_RESOLUTION_TEST_PACKAGE_ROOT, 'lib/flagqai-platform/harness-adapter/agent-resolution.mjs'))
  : new URL('../../../packages/harness-adapter/agent-resolution.mjs', import.meta.url)
const { createAgentResolver } = await import(moduleUrl.href)

const startup = { provider: 'gateway', model: 'current-model' }
for (const scenario of [
  { name: 'never-started session uses validated startup route', recorded: undefined, expected: startup },
  { name: 'recorded route survives a different current model', recorded: { provider: 'saved', model: 'saved-model' }, expected: { provider: 'saved', model: 'saved-model' } },
  { name: 'complete explicit override wins atomically', configured: { provider: 'override', model: 'chosen' }, recorded: { provider: 'saved', model: 'saved-model' }, expected: { provider: 'override', model: 'chosen' } },
  { name: 'half pin never mixes with the startup route', configured: { provider: 'orphan' }, expected: startup },
]) {
  test(scenario.name, async () => {
    let resumedRoute, validated = 0, created = 0, settled = 0
    const resolve = createAgentResolver({
      explicitRoute: route => route.provider && route.model ? route : undefined,
      existing: () => undefined,
      reserveMount: async () => ({ ok: true, reservation: { abandon() { assert.fail('unexpected abandon') }, settle() { settled++ } } }),
      prepareResume() {},
      persistedPreset: async () => 'standard',
      composePreset: async () => ({ agentPreset: 'standard' }),
      persistedRoute: async () => scenario.recorded,
      validateRoute: async route => { validated++; return { route } },
      resume: async (id, route) => { assert.equal(id, 'saved-session'); resumedRoute = route; return { agent: { options: route } } },
      create: async () => { created++; assert.fail('must not create another session') },
      recordedRoute: () => undefined,
    })
    const resolved = await resolve({ requestedSessionId: 'saved-session', configuredRoute: scenario.configured ?? {}, startupRoute: startup, meta: { cwd: '/workspace' } })
    assert.deepEqual(resumedRoute, scenario.expected)
    assert.deepEqual(resolved.route, scenario.expected)
    assert.deepEqual(resolved.agent.options, scenario.expected)
    assert.equal(validated, scenario.recorded || scenario.configured?.model ? 0 : 1)
    assert.equal(created, 0)
    assert.equal(settled, 1)
  })
}

test('startup validation failure releases the mount without resuming or creating a session', async () => {
  let abandoned = 0, settled = 0, resumed = 0, created = 0
  const cause = new Error('Model catalog unavailable')
  const resolve = createAgentResolver({
    explicitRoute: () => undefined,
    existing: () => undefined,
    reserveMount: async () => ({ ok: true, reservation: { abandon() { abandoned++ }, settle() { settled++ } } }),
    prepareResume() {},
    persistedPreset: async () => 'standard',
    composePreset: async () => ({ agentPreset: 'standard' }),
    persistedRoute: async () => undefined,
    validateRoute: async () => { throw cause },
    resume: async () => { resumed++; assert.fail('must not resume without a route') },
    create: async () => { created++; assert.fail('must not create a replacement session') },
  })
  await assert.rejects(resolve({ requestedSessionId: 'saved-session', configuredRoute: {}, startupRoute: startup, meta: { cwd: '/workspace' } }), error => {
    assert.equal(error.cause, cause)
    assert.match(error.message, /Model catalog unavailable.*No fresh session was created instead/)
    return true
  })
  assert.deepEqual({ abandoned, settled, resumed, created }, { abandoned: 1, settled: 1, resumed: 0, created: 0 })
})

test('the validated fallback is supplied to native resume and returned to the client', async () => {
  const fallback = { provider: 'available', model: 'supported' }
  const resolve = createAgentResolver({
    explicitRoute: () => undefined,
    existing: () => undefined,
    reserveMount: async () => ({ ok: true, reservation: { abandon() { assert.fail('unexpected abandon') }, settle() {} } }),
    prepareResume() {},
    persistedPreset: async () => 'standard',
    composePreset: async () => ({ agentPreset: 'standard' }),
    persistedRoute: async () => undefined,
    validateRoute: async route => { assert.deepEqual(route, startup); return { route: fallback, rejected: startup } },
    resume: async (_id, route) => ({ agent: { options: route } }),
    recordedRoute: () => undefined,
  })
  const restored = await resolve({ requestedSessionId: 'saved-session', configuredRoute: {}, startupRoute: startup, meta: { cwd: '/workspace' } })
  assert.deepEqual(restored.route, fallback)
  assert.deepEqual(restored.agent.options, fallback)
})

test('a mounted session is reused without route lookup, admission or creation', async () => {
  const agent = { options: { provider: 'mounted', model: 'active' } }
  const resolve = createAgentResolver({
    explicitRoute: () => undefined,
    existing: id => { assert.equal(id, 'saved-session'); return agent },
    runningPreset: () => 'standard',
    reserveMount: () => assert.fail('must not mount twice'),
    validateRoute: () => assert.fail('must not change the mounted route'),
    create: () => assert.fail('must not create a replacement'),
  })
  const restored = await resolve({ requestedSessionId: 'saved-session', configuredRoute: {}, startupRoute: startup, meta: { cwd: '/workspace' } })
  assert.equal(restored.agent, agent)
  assert.equal(restored.agentPreset, 'standard')
})
