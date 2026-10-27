/** Registry-backed panel selection, also runnable against a clean installed package. */
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = realpathSync(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url)))
const installed = process.argv[2] !== undefined
const require = createRequire(join(packageRoot, 'package.json'))
const React = require('react')
const base = join(packageRoot, installed ? 'lib/types' : 'src')
const load = relative => import(pathToFileURL(join(base, relative)).href)
const [ui, { useSidePanel }, { usePanelInput }, { PanelHost }, { PanelCompactHost }, { panelStore }, prefs, bridge] = await Promise.all([
  load('ui.js'), load('components/sidePanel/useSidePanel.js'), load('components/sidePanel/usePanelInput.js'),
  load('components/sidePanel/PanelHost.js'), load('components/sidePanel/PanelCompactHost.js'),
  load('components/sidePanel/PanelStore.js'), load('tuiDisplayPrefs.js'), load('components/sidePanel/panelBridge.js'),
])
const { render, AlternateScreen, ThemeProvider, Box, Text } = ui
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
    assert.ok(performance.now() < deadline, 'panel selection did not settle')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
let controller
const keys = []
const visible = new Map()
const events = []
const disposers = new Set()
const subscribe = panelStore.subscribe(event => events.push(`${event.type}:${event.id}`))
function register(id) {
  function Panel(props) {
    visible.set(id, props.visible)
    React.useEffect(() => () => { visible.delete(id) }, [])
    usePanelInput(input => {
      if (input !== 'j') return false
      keys.push(id)
      return true
    }, { active: props.visible && props.focused })
    return React.createElement(Text, null, `panel-${id}`)
  }
  const dispose = panelStore.register({ id, source: 'plugin', title: id, component: Panel,
    compact: { maxRows: 1, component: () => React.createElement(Text, null, `compact-${id}`) },
  }, { pluginId: 'selection' })
  disposers.add(dispose)
  return () => { dispose(); disposers.delete(dispose) }
}
function Harness() {
  controller = useSidePanel({ columns: 120, fullscreen: true, editorOpen: false })
  return React.createElement(Box, { width: 38, height: 10, flexDirection: 'column' },
    controller.split
      ? React.createElement(PanelHost, { controller, channel: { notify() {} }, width: 38, height: 8 })
      : React.createElement(PanelCompactHost, { enabledPanelIds: controller.enabledPanelIds, activePanelId: controller.activePanelId, width: 38 }))
}
const configured = 'missing,selection:a,missing-middle,selection:b,missing-tail'
prefs.applySidePanelPanels(configured)
prefs.applySidePanelOpen(true)
const disposeA = register('selection:a')
let disposeB = register('selection:b')
let app
try {
  app = await render(React.createElement(AlternateScreen, null,
    React.createElement(ThemeProvider, { theme: 'dark' }, React.createElement(Harness))), {
    stdout: new Out(), stderr: new Out(), stdin: new In(), exitOnCtrlC: false, patchConsole: false,
  })
  await until(() => controller?.activePanelId === 'selection:a' && visible.get('selection:a') === true)
  assert.deepEqual(controller.enabledPanelIds, ['selection:a', 'selection:b'])
  assert.ok(events.includes('opened:selection:a'))
  controller.focusPanel()
  await until(() => events.includes('focused:selection:a'))
  controller.handleKey('j', {})
  assert.deepEqual(keys, ['selection:a'])
  assert.equal(controller.command('missing'), false)
  controller.openPanel('missing')
  controller.handleKey(']', {})
  await until(() => controller.activePanelId === 'selection:b' && visible.get('selection:b') === true
    && bridge.panelBridgeState.get().activePanelId === 'selection:b' && bridge.panelBridgeState.get().focus === 'panel')
  controller.handleKey('j', {})
  assert.deepEqual(keys, ['selection:a', 'selection:b'])
  controller.handleKey('1', {})
  await until(() => controller.activePanelId === 'selection:a' && bridge.panelBridgeState.get().activePanelId === 'selection:a')
  assert.equal(controller.command('selection:b'), true)
  await until(() => visible.get('selection:b') === true && controller.activePanelId === 'selection:b'
    && bridge.panelBridgeState.get().activePanelId === 'selection:b' && bridge.panelBridgeState.get().focus === 'panel')
  events.length = 0
  disposeB()
  await until(() => controller.activePanelId === 'selection:a' && visible.get('selection:a') === true && events.includes('focused:selection:a'))
  assert.deepEqual(events.filter(event => !event.startsWith('unregistered:')), [
    'blurred:selection:b', 'closed:selection:b', 'opened:selection:a', 'focused:selection:a',
  ])
  controller.handleKey('j', {})
  assert.equal(keys.at(-1), 'selection:a')
  // Re-registering a removed panel must not restore the stale selection.
  disposeB = register('selection:b')
  await until(() => controller.enabledPanelIds.length === 2)
  assert.equal(controller.activePanelId, 'selection:a')
  controller.handleKey('[', {})
  await until(() => controller.activePanelId === 'selection:b')
  events.length = 0
  disposeB()
  disposeA()
  await until(() => controller.activePanelId === undefined && !controller.split
    && bridge.panelBridgeState.get().activePanelId === undefined)
  assert.deepEqual(controller.enabledPanelIds, [])
  assert.equal(controller.handleKey('j', {}), false, 'empty sidebar must not swallow chat keys')
  assert.equal(controller.command('missing'), false)
  assert.equal(bridge.panelBridgeState.get().activePanelId, undefined)
  register('selection:b')
  await until(() => controller.activePanelId === 'selection:b' && visible.get('selection:b') === true
    && bridge.panelBridgeState.get().activePanelId === 'selection:b' && bridge.panelBridgeState.get().focus === 'panel')
  assert.ok(events.includes('opened:selection:b'))
  assert.equal(prefs.getSidePanelPanels(), configured, 'unavailable plugin preferences must survive for later registration')
  console.log('PASS panel selection: stale IDs, keyboard and numeric navigation, removal, re-registration, lifecycle, empty registry')
} finally {
  await app?.unmount()
  subscribe()
  for (const dispose of disposers) dispose()
}
