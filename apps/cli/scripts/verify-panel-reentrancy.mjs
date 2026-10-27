/** Reentrant disposal and activation-wide open limits, including installed packages. */
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { mock } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
const packageRoot = realpathSync(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url)))
const require = createRequire(join(packageRoot, 'package.json'))
const base = join(packageRoot, process.argv[2] === undefined ? 'src' : 'lib/types')
const load = relative => import(pathToFileURL(join(base, relative)).href)
const [{ Context }, { TuiPanelRuntime }, owners, { panelStore }, { panelBridgeRequests }, prefs] = await Promise.all([
  import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href), load('dsh-adapter/panels.js'),
  load('dsh-adapter/panel-runtime-registry.js'), load('components/sidePanel/PanelStore.js'),
  load('components/sidePanel/panelBridge.js'), load('tuiDisplayPrefs.js'),
])
const root = new Context()
await root.plugin(TuiPanelRuntime)
let contextA, contextB
root.inject(['tuiPanels'], ctx => { contextA = ctx })
root.inject(['tuiPanels'], ctx => { contextB = ctx })
await new Promise(resolve => setImmediate(resolve))
const a = contextA.get('tuiPanels'), b = contextB.get('tuiPanels')
const disposers = new Set()
const listeners = []
function register(service, slug) {
  const dispose = service.register({ apiVersion: 1, id: slug, title: slug, component: () => null })
  assert.equal(typeof dispose, 'function')
  disposers.add(dispose)
  const id = service.list().find(panel => panel.id.endsWith(`:${slug}`)).id
  return { id, dispose: () => { try { dispose() } finally { disposers.delete(dispose) } } }
}
let now = 0
const clock = mock.method(performance, 'now', () => now)
let attached = false
const delivered = []
let onRequest = () => {}
listeners.push(panelBridgeRequests.subscribe(request => { delivered.push(request.id); onRequest(request) }))
try {
  let first = register(a, 'first')
  let second = register(a, 'second')
  const third = register(a, 'third'), fourth = register(a, 'fourth')
  const foreign = register(b, 'foreign')
  assert.equal(a.open(first.id), false, 'no consumer must not use the window')
  panelBridgeRequests.attach(); attached = true
  assert.equal(a.open(first.id), true, 'first request is allowed even at monotonic time zero')
  assert.equal(a.open(second.id), false, 'other panels must share the activation window')
  assert.equal(b.open(foreign.id), true, 'other activations must remain independent')
  now = 4999
  assert.equal(a.open(second.id), false)
  now = 5000
  assert.equal(a.open(second.id), true, 'window expires exactly at five seconds')

  let replaced = false
  listeners.push(a.subscribe(event => {
    if (event.type === 'unregistered' && event.id === first.id && !replaced) {
      replaced = true
      first = register(a, 'first')
    }
  }))
  first.dispose()
  assert.equal(replaced, true)
  assert.equal(a.list().length, 4, 'replacement must work at the per-plugin quota')
  assert.ok(owners.getPanelOwnerRecord(first.id))
  assert.ok(prefs.parseSidePanelIds(prefs.getSidePanelPanels()).includes(first.id))
  assert.equal(a.badge(first.id, { level: 'info', unread: 2 }), true)
  assert.equal(a.open(first.id), false, 're-registering cannot reset the shared window')
  first.dispose(); second.dispose(); third.dispose(); fourth.dispose()
  assert.equal(a.list().length, 0)
  first = register(a, 'first')
  second = register(a, 'second')
  assert.equal(a.open(first.id), false, 'removing every panel cannot reset the live activation window')
  now = 10000
  const nested = []
  onRequest = request => {
    if (request.id === first.id) nested.push(a.open(first.id), a.open(second.id))
  }
  const before = delivered.length
  assert.equal(a.open(first.id), true)
  assert.deepEqual(nested, [false, false], 'in-flight requests must block callback reentry')
  assert.equal(delivered.length, before + 1)
  now = 15000
  onRequest = () => { throw new Error('injected bridge delivery failure') }
  assert.equal(a.open(second.id), false)
  onRequest = () => {}
  assert.equal(a.open(second.id), true, 'failed delivery must release the reservation')
  now = 20000
  panelBridgeRequests.detach(); attached = false
  assert.equal(a.open(first.id), false)
  panelBridgeRequests.attach(); attached = true
  assert.equal(a.open(first.id), true)

  // Old disposal must preserve a replacement even when a later host subscriber throws.
  let replacement
  listeners.push(a.subscribe(event => {
    if (event.type === 'unregistered' && event.id === second.id && replacement === undefined) replacement = register(a, 'second')
  }))
  const stopThrow = panelStore.subscribe(event => {
    if (event.type === 'unregistered' && event.id === second.id) throw new Error('injected unregister listener failure')
  })
  try { assert.throws(() => second.dispose(), /injected unregister listener failure/) }
  finally { stopThrow() }
  assert.ok(replacement)
  assert.equal(a.badge(replacement.id, { level: 'warning', unread: 1 }), true)
  assert.ok(prefs.parseSidePanelIds(prefs.getSidePanelPanels()).includes(replacement.id))

  // The rollback of a failed publication must also leave a callback replacement intact.
  let rollbackReplacement, failOnce = true
  listeners.push(a.subscribe(event => {
    if (event.type === 'unregistered' && event.id.endsWith(':rollback') && rollbackReplacement === undefined) rollbackReplacement = register(a, 'rollback')
  }))
  const stopPublication = panelStore.subscribe(event => {
    if (event.type === 'registered' && event.id.endsWith(':rollback') && failOnce) {
      failOnce = false
      throw new Error('injected publication failure')
    }
  })
  try { assert.throws(() => a.register({ apiVersion: 1, id: 'rollback', title: 'Rollback', component: () => null }), /injected publication failure/) }
  finally { stopPublication() }
  assert.ok(rollbackReplacement)
  assert.equal(a.badge(rollbackReplacement.id, { level: 'info', unread: 1 }), true)
  assert.ok(prefs.parseSidePanelIds(prefs.getSidePanelPanels()).includes(rollbackReplacement.id))
  console.log('PASS panel reentrancy: replacement ownership/enabled state, quota, rollback, shared monotonic window, re-registration, callback reentry and failed delivery')
} finally {
  if (attached) panelBridgeRequests.detach()
  for (const stop of listeners) stop()
  for (const dispose of disposers) dispose()
  clock.mock.restore()
}
