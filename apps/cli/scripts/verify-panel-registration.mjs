/** Registration events and ownership, reusable against the installed package. */
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = realpathSync(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url)))
const require = createRequire(join(packageRoot, 'package.json'))
const base = join(packageRoot, process.argv[2] === undefined ? 'src' : 'lib/types')
const load = relative => import(pathToFileURL(join(base, relative)).href)
const [{ Context }, { TuiPanelRuntime }, { panelStore }, owners, prefs, ui, { useSidePanel }, bridge] = await Promise.all([
  import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href), load('dsh-adapter/panels.js'),
  load('components/sidePanel/PanelStore.js'), load('dsh-adapter/panel-runtime-registry.js'), load('tuiDisplayPrefs.js'),
  load('ui.js'), load('components/sidePanel/useSidePanel.js'), load('components/sidePanel/panelBridge.js'),
])
const React = require('react')
const { render, AlternateScreen, ThemeProvider, Text } = ui
class Out extends Writable {
  columns = 120; rows = 24; isTTY = true
  _write(_chunk, _encoding, callback) { callback() }
}
class In extends PassThrough {
  isTTY = true
  setRawMode() { return this }
  ref() { return this }
  unref() { return this }
}
async function until(predicate) {
  const deadline = performance.now() + 4000
  while (!predicate()) {
    assert.ok(performance.now() < deadline, 'registered callback open did not settle')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
let controller
function Harness() {
  controller = useSidePanel({ columns: 120, fullscreen: true, editorOpen: false })
  return React.createElement(Text, null, controller.activePanelId ?? 'empty')
}
prefs.applySidePanelPanels('unavailable')
prefs.applySidePanelOpen(false)
const root = new Context()
await root.plugin(TuiPanelRuntime)
let contextA, contextB
root.inject(['tuiPanels'], ctx => { contextA = ctx })
root.inject(['tuiPanels'], ctx => { contextB = ctx })
await new Promise(resolve => setImmediate(resolve))
assert.ok(contextA && contextB)
const a = contextA.get('tuiPanels')
const b = contextB.get('tuiPanels')
const eventsA = [], eventsB = [], callbackChecks = []
const stopA = a.subscribe(event => {
  eventsA.push(`${event.type}:${event.id}`)
  if (event.type !== 'registered') return
  callbackChecks.push(a.list().some(panel => panel.id === event.id))
  callbackChecks.push(a.badge(event.id, { level: 'info', unread: 3 }))
  if (event.id.endsWith(':first')) callbackChecks.push(a.open(event.id))
  // A crashing subscriber must not prevent registration or other subscribers.
  throw new Error('expected registered-listener fixture failure')
})
const stopB = b.subscribe(event => eventsB.push(`${event.type}:${event.id}`))
let secondSubscriber = 0
const stopSecond = a.subscribe(event => { if (event.type === 'registered') secondSubscriber++ })
const disposers = []
let app
try {
  app = await render(React.createElement(AlternateScreen, null,
    React.createElement(ThemeProvider, { theme: 'dark' }, React.createElement(Harness))), {
    stdout: new Out(), stderr: new Out(), stdin: new In(), exitOnCtrlC: false, patchConsole: false,
  })
  await until(() => bridge.panelBridgeRequests.hasConsumer())
  assert.equal(controller.activePanelId, undefined)

  const dispose = a.register({ apiVersion: 1, id: 'first', title: 'First', component: () => null })
  assert.equal(typeof dispose, 'function')
  disposers.push(dispose)
  const id = a.list().find(panel => panel.id.endsWith(':first')).id
  const prefix = id.slice(0, -'first'.length)
  assert.equal(eventsA.filter(event => event === `registered:${id}`).length, 1)
  assert.deepEqual(callbackChecks, [true, true, true], 'ownership and open must already be usable during registered')
  await until(() => controller.open && controller.activePanelId === id)
  assert.equal(panelStore.get(id).badge.unread, 3)
  assert.equal(secondSubscriber, 1)
  assert.deepEqual(eventsB, [], 'foreign registration and nested badge must remain private')
  assert.equal(a.register({ apiVersion: 1, id: 'first', title: 'Duplicate', component: () => null }), undefined)
  assert.equal(a.register({ apiVersion: 2, id: 'invalid', title: 'Invalid', component: () => null }), undefined)
  assert.equal(eventsA.filter(event => event.startsWith('registered:')).length, 1)
  const originalRegister = panelStore.register
  const failedId = `${prefix}failure`
  const countBefore = owners.countPluginPanels()
  panelStore.register = () => { throw new Error('injected store admission failure') }
  try {
    assert.throws(() => a.register({ apiVersion: 1, id: 'failure', title: 'Failure', component: () => null }), /injected store admission failure/)
  } finally { panelStore.register = originalRegister }
  assert.equal(owners.getPanelOwnerRecord(failedId), undefined)
  assert.equal(panelStore.get(failedId), undefined)
  assert.equal(owners.countPluginPanels(), countBefore)
  assert.ok(!prefs.parseSidePanelIds(prefs.getSidePanelPanels()).includes(failedId))
  assert.ok(!eventsA.includes(`registered:${failedId}`))
  const configuredBefore = prefs.getSidePanelPanels()
  prefs.applySidePanelPanels(`${configuredBefore},${failedId}`)
  panelStore.register = () => { throw new Error('configured admission failure') }
  try {
    assert.throws(() => a.register({ apiVersion: 1, id: 'failure', title: 'Configured failure', component: () => null }), /configured admission failure/)
  } finally { panelStore.register = originalRegister }
  assert.ok(prefs.parseSidePanelIds(prefs.getSidePanelPanels()).includes(failedId), 'rollback must preserve previously configured IDs')
  assert.equal(owners.getPanelOwnerRecord(failedId), undefined)
  prefs.applySidePanelPanels(configuredBefore)
  const publishedId = `${prefix}publication`
  const stopFailure = panelStore.subscribe(event => {
    if (event.type === 'registered' && event.id === publishedId) throw new Error('injected publication failure')
  })
  try {
    assert.throws(() => a.register({ apiVersion: 1, id: 'publication', title: 'Publication', component: () => null }), /injected publication failure/)
  } finally { stopFailure() }
  assert.equal(owners.getPanelOwnerRecord(publishedId), undefined)
  assert.equal(panelStore.get(publishedId), undefined)
  assert.ok(!panelStore.list().some(entry => entry.definition.id === publishedId))
  assert.equal(owners.countPluginPanels(), countBefore)
  assert.ok(!prefs.parseSidePanelIds(prefs.getSidePanelPanels()).includes(publishedId))
  assert.deepEqual(eventsA.filter(event => event.endsWith(`:${publishedId}`) && !event.startsWith('badge:')), [
    `registered:${publishedId}`, `unregistered:${publishedId}`,
  ])
  const publishedRetry = a.register({ apiVersion: 1, id: 'publication', title: 'Retry publication', component: () => null })
  assert.equal(typeof publishedRetry, 'function')
  disposers.push(publishedRetry)
  publishedRetry()
  const retry = a.register({ apiVersion: 1, id: 'failure', title: 'Retry', component: () => null })
  assert.equal(typeof retry, 'function')
  disposers.push(retry)
  assert.equal(eventsA.filter(event => event === `registered:${failedId}`).length, 1)
  retry()
  dispose()
  assert.equal(eventsA.filter(event => event === `unregistered:${id}`).length, 1)
  assert.equal(owners.getPanelOwnerRecord(id), undefined)
  assert.equal(owners.getPanelOwnerRecord(failedId), undefined)
  assert.deepEqual(eventsB, [])
  console.log('PASS panel registration: exactly-once owned events, synchronous API use, foreign isolation, listener errors, admission rollback and retry')
} finally {
  await app?.unmount()
  for (const dispose of disposers) dispose()
  stopA(); stopB(); stopSecond()
}
