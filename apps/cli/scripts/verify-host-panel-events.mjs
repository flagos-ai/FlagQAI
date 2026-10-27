/** Host event provenance survives deletion, late subscription and ID reuse. */
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const packageRoot = realpathSync(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url)))
const require = createRequire(join(packageRoot, 'package.json'))
const base = join(packageRoot, process.argv[2] === undefined ? 'src' : 'lib/types')
const load = relative => import(pathToFileURL(join(base, relative)).href)
const [{ Context }, { TuiPanelRuntime, getHostPanelRuntime }, { panelStore }] = await Promise.all([
  import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href),
  load('dsh-adapter/panels.js'), load('components/sidePanel/PanelStore.js'),
])
const root = new Context()
await root.plugin(TuiPanelRuntime)
const host = getHostPanelRuntime(root.get('tuiPanels'))
const disposers = [], stops = []
const events = []
const stop = host.subscribe(event => events.push(`${event.type}:${event.id}`))
stops.push(stop)
function builtin(id) {
  const dispose = panelStore.register({ id, title: id, source: 'builtin', component: () => null }, 'builtin')
  disposers.push(dispose)
  return dispose
}
try {
  const id = 'hostprobe:events'
  const dispose = host.register({ id, title: 'Events' })
  disposers.push(dispose)
  const late = []
  stops.push(host.subscribe(event => late.push(`${event.type}:${event.id}`)))
  panelStore.setBadge(id, { level: 'info', unread: 2 })
  dispose(); dispose()
  assert.deepEqual(events, [`registered:${id}`, `badge:${id}`, `unregistered:${id}`])
  assert.deepEqual(late, [`badge:${id}`, `unregistered:${id}`])
  const again = host.register({ id, title: 'Again' })
  disposers.push(again)
  again()
  assert.equal(events.filter(event => event === `unregistered:${id}`).length, 2)
  const beforeBuiltin = events.length
  builtin('hostprobe:builtin')()
  assert.equal(events.length, beforeBuiltin, 'builtin registration/removal must be filtered')

  // Regular plugin-service registrations must also reach host observers.
  let context
  root.inject(['tuiPanels'], ctx => { context = ctx })
  await new Promise(resolve => setImmediate(resolve))
  const service = context.get('tuiPanels')
  const pluginDispose = service.register({ apiVersion: 1, id: 'plugin', title: 'Plugin', component: () => null })
  disposers.push(pluginDispose)
  const pluginId = service.list()[0].id
  pluginDispose()
  assert.ok(events.includes(`registered:${pluginId}`) && events.includes(`unregistered:${pluginId}`))

  // Classification must use the old entry even if an earlier observer reuses its ID.
  let replacement
  const flipId = 'hostprobe:flip'
  const stopFlip = panelStore.subscribe(event => {
    if (event.type === 'unregistered' && event.id === flipId && replacement === undefined) replacement = builtin(flipId)
  })
  const flipEvents = []
  const stopFlipHost = host.subscribe(event => flipEvents.push(`${event.type}:${event.id}`))
  const old = host.register({ id: flipId })
  disposers.push(old)
  old()
  assert.deepEqual(flipEvents, [`registered:${flipId}`, `unregistered:${flipId}`])
  stopFlip(); replacement(); stopFlipHost()

  let pluginReplacement
  const reverseId = 'hostprobe:reverse'
  const stopReverse = panelStore.subscribe(event => {
    if (event.type === 'unregistered' && event.id === reverseId && pluginReplacement === undefined) {
      pluginReplacement = host.register({ id: reverseId })
      disposers.push(pluginReplacement)
    }
  })
  const reverseEvents = []
  const stopReverseHost = host.subscribe(event => reverseEvents.push(`${event.type}:${event.id}`))
  builtin(reverseId)()
  assert.deepEqual(reverseEvents, [`registered:${reverseId}`], 'builtin removal must not be relabeled as its plugin replacement')
  stopReverse(); pluginReplacement(); stopReverseHost()

  // A publication failure retracts the host notification after deleting the entry.
  const rollbackId = 'hostprobe:rollback'
  const stopFailure = panelStore.subscribe(event => {
    if (event.type === 'registered' && event.id === rollbackId) throw new Error('injected host publication failure')
  })
  try { assert.throws(() => host.register({ id: rollbackId }), /injected host publication failure/) }
  finally { stopFailure() }
  assert.deepEqual(events.filter(event => event.endsWith(`:${rollbackId}`)), [`registered:${rollbackId}`, `unregistered:${rollbackId}`])
  assert.equal(panelStore.get(rollbackId), undefined)
  stop()
  const afterStop = events.length
  const stopped = host.register({ id: 'hostprobe:stopped' })
  disposers.push(stopped)
  stopped()
  assert.equal(events.length, afterStop)
  console.log('PASS host panel events: deletion, late subscribers, idempotent disposal, ID reuse, builtin filtering, plugin service, rollback and unsubscribe')
} finally {
  for (const stop of stops) stop()
  for (const dispose of disposers) dispose()
}
