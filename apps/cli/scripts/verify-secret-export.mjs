/** Secret questionnaire results stay masked in durable DSH exports. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const packageRoot = realpathSync(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url)))
const base = join(packageRoot, process.argv[2] === undefined ? 'src' : 'lib/types')
// A managed profile gets optional Harness peers from the host's official
// runtime interception, rather than Node's standalone package resolution.
let runtimeScope
if (process.argv[3] !== undefined) {
  const require = createRequire(join(process.argv[3], 'package.json'))
  const [{ Context }, { createRuntimeResolution, PluginPackages }] = await Promise.all([
    import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href),
    import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href),
  ])
  process.env.DSH_HOME = join(dirname(process.argv[3]), 'dsh')
  const { prepareProfile, INSTALL_ANCHOR } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh/profile-boot')).href)
  const resolution = await createRuntimeResolution({ installAnchor: INSTALL_ANCHOR, profile: prepareProfile('flagqai', false) })
  runtimeScope = new Context().plugin(PluginPackages, { resolution })
  await runtimeScope
}
const { createReportActions } = await import(pathToFileURL(join(base, 'dsh-adapter/channel/reports.js')).href)
const cwd = await mkdtemp(join(tmpdir(), 'flagqai-secret-export-'))
const secret = 'SYNTHETIC-SECRET-NOT-A-CREDENTIAL'
try {
  for (const legacy of [false, true]) {
    for (const rawResult of [JSON.stringify({ answers: [{ selected: [secret], custom: secret }, { selected: [], custom: 'Visible answer' }] }), secret]) {
      const call = (callId, name, args) => ({ type: 'tool/call', seq: 1, time: 1, data: { callId, name, arguments: JSON.stringify(args) } })
      const result = (callId, text) => ({ type: 'tool/result', seq: 2, time: 2, data: { message: { role: 'tool', toolCallId: callId, content: legacy
        ? [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }], isError: false }]
        : [{ type: 'text', text }] } } })
      const events = [
        call('secret', 'ask_user_question', { questions: [{ question: 'Token?', secret: true }, { question: 'Name?' }] }),
        call('ordinary', 'ask_user_question', { questions: [{ question: 'Public?' }] }),
        result('ordinary', '{"answers":[{"custom":"Public result"}]}'),
        result('secret', rawResult),
        call('tool', 'read_file', { path: 'fixture' }), result('tool', 'Ordinary tool output'),
        call('secret', 'ask_user_question', { questions: [{ question: 'Reused ID?' }] }), result('secret', 'Reused public result'),
      ]
      const agent = { id: 'fixture', session: { id: 'fixture', events } }
      const capture = { agent, generation: 1 }
      const actions = createReportActions({ get: () => undefined }, {
        owner: { current: () => true }, capture: () => capture, current: () => true,
        cwd: () => cwd, model: () => 'fixture', provider: () => '', contextWindow: () => undefined,
        sessionTitle: () => '', runtime: {}, grantStore: () => undefined,
      })
      const path = actions.exportSession()
      assert.ok(path)
      const exported = await readFile(path, 'utf8')
      assert.ok(!exported.includes(secret), 'secret answer must never enter the export')
      assert.ok(exported.includes('••••'), 'secret result must be visibly masked')
      if (rawResult.startsWith('{')) assert.ok(exported.includes('Visible answer'), 'ordinary answer in a mixed questionnaire stays visible')
      for (const text of ['Public result', 'Ordinary tool output', 'Reused public result']) assert.ok(exported.includes(text), text)
    }
  }
  console.log('PASS secret export: modern/legacy results, mixed questions, malformed secret result, ordinary tools and reused call IDs')
} finally {
  await runtimeScope?.dispose()
  await rm(cwd, { recursive: true, force: true })
}
