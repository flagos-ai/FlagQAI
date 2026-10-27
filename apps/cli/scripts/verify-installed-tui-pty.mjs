/** Exercise the installed CLI in a real PTY without a live provider credential. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import xterm from '@xterm/headless'

const require = createRequire(import.meta.url)

function touchedSessions(home) {
  try {
    return Object.keys(JSON.parse(readFileSync(join(home, '.flagqai', 'last-used.json'), 'utf8')))
  } catch {
    return []
  }
}

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

/**
 * Type text into a PTY, one character at a time on Windows.
 *
 * POSIX PTYs deliver a written chunk as a sequence of key events, so a whole
 * command lands in the composer the way a fast typist would produce it. ConPTY
 * does not: the same chunk can be coalesced or partly consumed by whatever
 * handler is active, and on the Windows acceptance run `/provider` ended with
 * only `r` in the composer, so the provider menu never opened and the check
 * timed out. Typing character by character removes the coalescing entirely.
 *
 * Only the multi-character text goes through here. Escape sequences and a lone
 * Enter stay whole, because splitting those changes their meaning.
 */
const TYPE_DELAY_MS = process.platform === 'win32' ? 25 : 0

async function writeText(child, text) {
  if (TYPE_DELAY_MS === 0 || text.length < 2) {
    child.write(text)
    return
  }
  for (const character of text) {
    child.write(character)
    await delay(TYPE_DELAY_MS)
  }
}

export async function verifyInstalledTuiPty({ entry, cwd, env, modulePath, profilePatch, verifyProviderWizard = false, verifyAgentTurn = false }) {
  assert.ok(!verifyAgentTurn || verifyProviderWizard, 'the agent turn requires the isolated provider wizard')
  const pty = require(modulePath)
  const routeName = process.env.FLAGQAI_ACCEPTANCE_ROUTE_NAME ?? 'fixture-gateway'
  const terminal = new xterm.Terminal({ cols: 100, rows: 32, scrollback: 1000, allowProposedApi: true })
  const modelRequests = []
  const agentRequests = []
  const endpoint = verifyProviderWizard ? createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      modelRequests.push({ path: request.url, authorization: request.headers.authorization })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'fixture-model', object: 'model' }] }))
      return
    }
    if (verifyAgentTurn && request.method === 'POST' && request.url === '/v1/chat/completions') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      agentRequests.push({ path: request.url, authorization: request.headers.authorization,
        model: body.model, messages: body.messages })
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const choice of [
        { delta: { role: 'assistant', content: 'FLAGQAI_PTY_AGENT_READY' }, finish_reason: null },
        { delta: {}, finish_reason: 'stop' },
      ]) {
        response.write(`data: ${JSON.stringify({ id: 'pty-agent-fixture', object: 'chat.completion.chunk', created: 1,
          model: body.model, choices: [{ index: 0, ...choice }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
      }
      response.end('data: [DONE]\n\n')
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'Unknown local fixture route' } }))
  }) : undefined
  let output = ''
  let exit
  let child
  const screen = () => {
    const buffer = terminal.buffer.active
    return Array.from({ length: 32 }, (_, index) => buffer.getLine(buffer.baseY + index)?.translateToString(true) ?? '').join('\n')
  }
  try {
    if (endpoint) {
      await new Promise((resolve, reject) => {
        endpoint.once('error', reject)
        endpoint.listen(0, '127.0.0.1', resolve)
      })
    }
    child = pty.spawn(process.execPath, [entry], {
      name: 'xterm-256color', cols: 100, rows: 32, cwd,
      env: { ...env, TERM: 'xterm-256color', FLAGQAI_LANG: 'en', DSH_TELEMETRY_MODE: 'DISABLED' },
    })
    const type = text => writeText(child, text)
    child.onData(data => {
      output = (output + data).slice(-128 * 1024)
      terminal.write(data)
    })
    child.onExit(event => { exit = event })
    await waitFor(() => exit !== undefined || screen().includes('Welcome to FlagQAI') || screen().includes('Say something, or type'), 90000, 'FlagQAI first screen')
    if (exit !== undefined) throw new Error(`TUI exited before its first screen appeared (code ${exit.exitCode})`)
    if (screen().includes('Welcome to FlagQAI')) child.write('\u001b')
    await waitFor(() => exit !== undefined || screen().includes('Say something, or type'), 30000, 'FlagQAI command prompt')
    assert.equal(exit, undefined, `TUI exited before its command prompt appeared (code ${exit?.exitCode})`)
    await type('/provider')
    await waitFor(() => exit !== undefined || screen().includes('Add, edit or delete an LLM provider'), 10000, 'provider command selection')
    child.write('\r')
    await waitFor(() => exit !== undefined || screen().includes('Add a new provider'), 15000, 'installed provider wizard')
    assert.equal(exit, undefined, `TUI exited before its provider wizard appeared (code ${exit?.exitCode})`)
    child.write('\r')
    await waitFor(() => exit !== undefined || (screen().includes('Built-in provider') && screen().includes('Custom API endpoint')), 10000, 'official and compatible-relay choices')
    assert.equal(exit, undefined, `TUI exited before provider route choices appeared (code ${exit?.exitCode})`)
    if (verifyProviderWizard) {
      const address = endpoint.address()
      assert.ok(address && typeof address !== 'string')
      child.write('\u001b[B\r')
      await waitFor(() => exit !== undefined || screen().includes('Enter a route name'), 10000, 'custom route name')
      await type(routeName)
      await waitFor(() => exit !== undefined || screen().includes(routeName), 10000, 'typed route name')
      child.write('\r')
      await waitFor(() => exit !== undefined || screen().includes('Enter the API key'), 10000, 'custom API key')
      await type('fixture-secret-never-send')
      await delay(250)
      assert.ok(!output.includes('fixture-secret-never-send'), 'the API key must be masked while typing')
      child.write('\r')
      await waitFor(() => exit !== undefined || screen().includes('Enter the baseURL'), 10000, 'custom endpoint')
      await type(`http://127.0.0.1:${address.port}/v1`)
      await waitFor(() => exit !== undefined || screen().includes(`/v1`), 10000, 'typed custom endpoint')
      child.write('\r')
      await waitFor(() => exit !== undefined || screen().includes('Choose the wire protocol'), 10000, 'custom protocol')
      child.write('\r')
      await waitFor(() => exit !== undefined || screen().includes('Select the models to enable'), 20000, 'local model discovery')
      assert.match(screen(), /fixture-model/u)
      child.write(' ')
      await delay(100)
      child.write('\r')
      await waitFor(() => exit !== undefined || screen().includes('Write this provider configuration?'), 10000, 'provider confirmation')
      child.write('\r')
      await waitFor(() => exit !== undefined || screen().includes('Switch to the new provider now?'), 10000, 'provider switch choice')
      const sessionsBeforeSwitch = new Set(touchedSessions(env.HOME))
      if (!verifyAgentTurn) {
        child.write('\u001b[B')
        await waitFor(() => exit !== undefined || /❯\s*● Keep the current model/u.test(screen()), 10000, 'keep-current-model choice')
      }
      child.write('\r')
      await waitFor(() => exit !== undefined || !screen().includes('Switch to the new provider now?'), 10000, 'completed provider wizard')
      if (verifyAgentTurn) {
        // The question disappears before Harness adopts the fork. Wait for
        // the durable session touch made after adoption, not a transient Ink
        // notification that terminal repainting may split or erase.
        await waitFor(() => exit !== undefined || touchedSessions(env.HOME).some(id => !sessionsBeforeSwitch.has(id)),
          90000, 'adopted provider model session')
      }
      assert.ok(screen().includes(verifyAgentTurn ? 'fixture-model' : `${routeName} · added`))
      assert.deepEqual(modelRequests, [{ path: '/v1/models', authorization: 'Bearer fixture-secret-never-send' }])
      const credentialPath = join(env.FLAGQAI_CLI_RUNTIME_ROOT, 'dsh', '.credentials.yaml')
      assert.match(await readFile(credentialPath, 'utf8'), /fixture-secret-never-send/u)
      if (process.platform !== 'win32') {
        assert.equal((await stat(credentialPath)).mode & 0o777, 0o600)
      }
      assert.ok(!output.includes('fixture-secret-never-send'), 'the API key must not appear in the terminal transcript')
      if (verifyAgentTurn) {
        // A live model switch can bring up the session supervisor. Return to
        // its composer before editing and submitting the Agent task.
        if (screen().includes('This terminal hosts several sessions')) {
          child.write('\u001b')
          await waitFor(() => exit !== undefined || !screen().includes('This terminal hosts several sessions'),
            10000, 'session composer after model switch')
        }
      }
    } else {
      child.write('\u001b')
      await waitFor(() => exit !== undefined || !screen().includes('Custom API endpoint'), 10000, 'provider wizard dismissal')
      assert.equal(exit, undefined, `TUI exited while dismissing its provider wizard (code ${exit?.exitCode})`)
    }
    // Exercise the installed composer as a user would, without submitting a
    // message or touching a model endpoint. This is a black-box contract for
    // a future independently implemented input surface.
    await type('FQEDITXYZ')
    await waitFor(() => exit !== undefined || screen().includes('FQEDITXYZ'), 10000, 'typed draft')
    assert.equal(exit, undefined, `TUI exited while typing a draft (code ${exit?.exitCode})`)
    child.write('\u001b[D\u007f')
    await waitFor(() => exit !== undefined || screen().includes('FQEDITXZ'), 10000, 'left-arrow and backspace editing')
    assert.equal(exit, undefined, `TUI exited while editing a draft (code ${exit?.exitCode})`)
    child.write('\u0003')
    await waitFor(() => exit !== undefined || !screen().includes('FQEDITXZ'), 10000, 'draft clearing')
    assert.equal(exit, undefined, `TUI exited while clearing a draft (code ${exit?.exitCode})`)
    child.write('/config')
    await waitFor(() => exit !== undefined || screen().includes('Show the active FlagQAI profile configuration'), 10000, 'config command selection')
    child.write('\r')
    await waitFor(() => exit !== undefined || screen().replace(/\s+/gu, '').includes(profilePatch), 10000, 'active managed profile path')
    assert.equal(exit, undefined, `TUI exited before /config reported its active profile (code ${exit?.exitCode})`)
    if (verifyAgentTurn) {
      child.write('Give a one-line acknowledgement for this local acceptance task.')
      await waitFor(() => exit !== undefined || screen().includes('local acceptance task'), 10000, 'agent task draft')
      child.write('\r')
      await waitFor(() => exit !== undefined || (agentRequests.length > 0 && screen().includes('FLAGQAI_PTY_AGENT_READY')),
        90000, 'installed TUI Agent response')
      assert.equal(exit, undefined, `TUI exited before its Agent responded (code ${exit?.exitCode})`)
      assert.ok(agentRequests.length > 0, 'the submitted TUI task must reach the local model')
      for (const request of agentRequests) {
        assert.equal(request.path, '/v1/chat/completions')
        assert.equal(request.authorization, 'Bearer fixture-secret-never-send')
        assert.equal(request.model, 'fixture-model')
      }
      assert.ok(agentRequests.some(request => /local acceptance task/u.test(JSON.stringify(request.messages))),
        'the Harness-backed turn must forward the submitted task')
      assert.ok(!output.includes('fixture-secret-never-send'), 'the API key must stay out of the Agent transcript')
    }
    child.write('/exit')
    await waitFor(() => exit !== undefined || (screen().includes('/exit') && screen().includes('Exit FlagQAI')), 10000, 'FlagQAI exit command selection')
    assert.equal(exit, undefined, `TUI exited before /exit could be selected (code ${exit?.exitCode})`)
    child.write('\r')
    await waitFor(() => exit !== undefined, 30000, 'TUI exit')
    assert.equal(exit.exitCode, 0, `TUI /exit returned ${exit.exitCode}; last screen:\n${screen()}`)
    assert.doesNotMatch(output, /UnhandledPromiseRejection|plugin tree failed to load/u)
    console.log(`PASS installed CLI TUI PTY: ${process.platform}/${process.arch}, draft edit/clear, provider routes${verifyAgentTurn ? ', local Agent turn' : ''}, and /exit returned 0`)
  } catch (error) {
    error.message += `\nLast screen:\n${screen()}\nOutput tail:\n${output.slice(-2000)}`
    throw error
  } finally {
    if (child && exit === undefined) {
      child.kill()
      await waitFor(() => exit !== undefined, 5000, 'PTY child termination').catch(() => {})
    }
    terminal.dispose()
    if (endpoint) await new Promise(resolve => endpoint.close(resolve))
  }
}
