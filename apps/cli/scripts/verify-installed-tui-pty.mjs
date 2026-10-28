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

async function waitFor(check, timeoutMs, label, screenText) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return
    await delay(100)
  }
  // Include what was on screen. A bare "timed out waiting for X" says the label
  // never appeared but not what did, which is the difference between "the app
  // is on the wrong screen" and "the text is drawn differently than expected".
  const tail = typeof screenText === 'function' ? screenText() : ''
  throw new Error(`Timed out waiting for ${label}${tail ? `\n--- screen ---\n${tail}` : ''}`)
}

/**
 * Like `waitFor`, but answers whether the condition held instead of throwing.
 * For checks whose absence is itself one of several findings the caller wants
 * to tell apart.
 */
async function waitForOr(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await delay(100)
  }
  return check()
}

/**
 * Type text into a PTY, one character at a time on Windows, letting the screen
 * settle before the next one.
 *
 * POSIX PTYs deliver a written chunk as a sequence of key events, so a whole
 * command lands in the composer the way a fast typist would produce it. ConPTY
 * does not: the same chunk can be coalesced or partly consumed by whatever
 * handler is active, and on the Windows acceptance run `/provider` ended with
 * only `r` in the composer, so the provider menu never opened and the check
 * timed out. Typing character by character removes the coalescing entirely.
 *
 * A fixed 25 ms gap did not remove the remaining losses. Two later runs typed
 * `/provider` and got `/pvider` and `/povider` — in both, the characters lost
 * are the ones immediately after the completion menu opened, which is exactly
 * where the app is mid-repaint (the whole command list redraws when the filter
 * narrows). A gap that short is shorter than that repaint. So the wait is now
 * on the observable condition: no output for QUIET_MS before the next
 * character, capped so a continuously repainting app cannot stall the run.
 *
 * Only the multi-character text goes through here. Escape sequences and a lone
 * Enter stay whole, because splitting those changes their meaning.
 */
const ONE_CHARACTER_AT_A_TIME = process.platform === 'win32'
/** How long the screen must be silent before the next character is written. */
const QUIET_MS = 40
/** How long to wait for the app to paint a keystroke before moving on. */
const REACTION_MS = 150
/** Cap on one settle, so a spinner cannot stall the whole run. */
const QUIET_CAP_MS = 500

/**
 * Does the rendered screen contain this text, ignoring whitespace?
 *
 * ConPTY does not always write the cell under a space: the renderer moves the
 * cursor past it and the cell keeps whatever was there before. The characters
 * are all present and in order, but `includes` on the extracted row text fails
 * because the separator is blank rather than ' '. The Windows run showed
 * `Add, edit or delet e a` for exactly this reason while the menu was open.
 *
 * Comparing with whitespace removed keeps the check meaningful — every word and
 * its order still has to match — without depending on how a space cell was
 * painted.
 */
function normalisedIncludes(haystack, needle) {
  const normalise = value => value.replace(/\s+/gu, '')
  return normalise(haystack).includes(normalise(needle))
}


async function writeText(child, text, settle) {
  if (!ONE_CHARACTER_AT_A_TIME || text.length < 2) {
    child.write(text)
    return
  }
  for (const character of text) {
    const writtenAt = Date.now()
    child.write(character)
    await settle(writtenAt)
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
  const screenHas = text => normalisedIncludes(screen(), text)
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
    let lastOutputAt = 0
    /** Resolve once the repaint caused by a write made at `since` has finished. */
    const settle = async since => {
      const started = Date.now()
      // Phase one: give the keystroke a chance to be painted at all. Without
      // this, "quiet since the write" is trivially true for the first few
      // milliseconds and the wait would end before the app reacted.
      while (lastOutputAt <= since && Date.now() - started < REACTION_MS) await delay(5)
      // Phase two: wait for that repaint to finish, capped so a spinner or a
      // streamed turn cannot stall the run.
      while (Date.now() - started < QUIET_CAP_MS
        && Date.now() - lastOutputAt < QUIET_MS) await delay(5)
    }
    const type = text => writeText(child, text, settle)
    child.onData(data => {
      lastOutputAt = Date.now()
      output = (output + data).slice(-128 * 1024)
      terminal.write(data)
    })
    child.onExit(event => { exit = event })
    await waitFor(() => exit !== undefined || screenHas('Welcome to FlagQAI') || screenHas('Say something, or type'), 90000, 'FlagQAI first screen', screen)
    if (exit !== undefined) throw new Error(`TUI exited before its first screen appeared (code ${exit.exitCode})`)
    if (screenHas('Welcome to FlagQAI')) child.write('\u001b')
    await waitFor(() => exit !== undefined || screenHas('Say something, or type'), 30000, 'FlagQAI command prompt', screen)
    assert.equal(exit, undefined, `TUI exited before its command prompt appeared (code ${exit?.exitCode})`)
    /**
     * Open `/provider` and walk to the mode question, which is where the
     * "Built-in provider" / "Custom API endpoint" choice is. Split out so the
     * Windows path can re-enter after a cancellation costs it the wizard;
     * everything up to here writes nothing, which is what makes re-entry safe.
     */
    const openProviderWizard = async () => {
      await type('/provider')
      await waitFor(() => exit !== undefined || screenHas('Add, edit or delete an LLM provider'), 10000, 'provider command selection', screen)
      child.write('\r')
      await waitFor(() => exit !== undefined || screenHas('Add a new provider'), 15000, 'installed provider wizard', screen)
      assert.equal(exit, undefined, `TUI exited before its provider wizard appeared (code ${exit?.exitCode})`)
      child.write('\r')
      await waitFor(() => exit !== undefined || (screenHas('Built-in provider') && screenHas('Custom API endpoint')), 10000, 'official and compatible-relay choices', screen)
      assert.equal(exit, undefined, `TUI exited before provider route choices appeared (code ${exit?.exitCode})`)
    }
    await openProviderWizard()
    if (verifyProviderWizard) {
      const address = endpoint.address()
      assert.ok(address && typeof address !== 'string')
      // Move the focus from "Built-in provider" to "Custom API endpoint" and
      // confirm the move from the rendered pointer before Enter follows.
      //
      // On Windows the arrow has to be re-entered rather than retried, because
      // ConPTY does not pass a written escape sequence straight through: it
      // turns the bytes into individual key events, so `\x1b[B` can reach the
      // app as ESC and then the rest after a gap. The app flushes a lone ESC
      // after 50 ms, and Escape cancels the add flow, which is the launchpad
      // with an empty composer that runs 40622665008, 40625474325 and
      // 40633146024 all dumped. The parser is not at fault — fed the same
      // sequence byte by byte it still produces a Down key — so this is the
      // transport's timing. Nothing has been written before this point, so
      // opening the wizard again costs three keystrokes and no state.
      const arrowAttempts = process.platform === 'win32' ? 3 : 1
      let movedToCustom = false
      for (let attempt = 1; attempt <= arrowAttempts && !movedToCustom; attempt += 1) {
        child.write('\u001b[B')
        movedToCustom = await waitForOr(() => exit !== undefined || screenHas('❯ ● Custom API endpoint'), 8000)
        if (movedToCustom) break
        const stillChoosing = screenHas('Built-in provider') || screenHas('Custom API endpoint')
        if (stillChoosing || attempt === arrowAttempts) {
          throw new Error((stillChoosing
            ? 'the Down arrow did not move the route choice: the option list is still on screen with the focus elsewhere'
            : `the route choice screen disappeared after the Down arrow on all ${attempt} attempts: `
              + 'the escape sequence was not delivered as one key') + '\n--- screen ---\n' + screen())
        }
        // The flush leaves the rest of the arrow as literal text in the
        // composer (probed: ESC flushes to one Escape key, then `[B` parses as
        // the text `[B`). Escape on a non-empty draft clears it, so the command
        // is not typed on top of that debris.
        child.write('\u001b')
        await waitForOr(() => !screen().includes('[B'), 2000)
        await openProviderWizard()
      }
      child.write('\r')
      try {
        await waitFor(() => exit !== undefined || screenHas('Enter a route name'), 10000, 'custom route name', screen)
      } catch (error) {
        // The focus move above passed, so the arrow reached the app. What is
        // left is Enter not landing; these are candidates the screen cannot
        // separate, not a diagnosis.
        if (!screenHas('Custom API endpoint')) {
          throw new Error('the wizard left the route choice without showing a route prompt '
            + '(candidates, unverified: Enter dismissed the question, another key reached the wizard, '
            + 'or the add flow was cancelled after the focus move)\n'
            + error.message)
        }
        throw error
      }
      await type(routeName)
      await waitFor(() => exit !== undefined || screen().includes(routeName), 10000, 'typed route name', screen)
      child.write('\r')
      await waitFor(() => exit !== undefined || screenHas('Enter the API key'), 10000, 'custom API key', screen)
      await type('fixture-secret-never-send')
      await delay(250)
      assert.ok(!output.includes('fixture-secret-never-send'), 'the API key must be masked while typing')
      child.write('\r')
      await waitFor(() => exit !== undefined || screenHas('Enter the baseURL'), 10000, 'custom endpoint', screen)
      await type(`http://127.0.0.1:${address.port}/v1`)
      await waitFor(() => exit !== undefined || screen().includes(`/v1`), 10000, 'typed custom endpoint', screen)
      child.write('\r')
      await waitFor(() => exit !== undefined || screenHas('Choose the wire protocol'), 10000, 'custom protocol', screen)
      child.write('\r')
      await waitFor(() => exit !== undefined || screenHas('Select the models to enable'), 20000, 'local model discovery', screen)
      assert.match(screen(), /fixture-model/u)
      child.write(' ')
      await delay(100)
      child.write('\r')
      await waitFor(() => exit !== undefined || screenHas('Write this provider configuration?'), 10000, 'provider confirmation', screen)
      child.write('\r')
      await waitFor(() => exit !== undefined || screenHas('Switch to the new provider now?'), 10000, 'provider switch choice', screen)
      const sessionsBeforeSwitch = new Set(touchedSessions(env.HOME))
      if (!verifyAgentTurn) {
        child.write('\u001b[B')
        await waitFor(() => exit !== undefined || /❯\s*● Keep the current model/u.test(screen()), 10000, 'keep-current-model choice', screen)
      }
      child.write('\r')
      await waitFor(() => exit !== undefined || !screenHas('Switch to the new provider now?'), 10000, 'completed provider wizard', screen)
      if (verifyAgentTurn) {
        // The question disappears before Harness adopts the fork. Wait for
        // the durable session touch made after adoption, not a transient Ink
        // notification that terminal repainting may split or erase.
        await waitFor(() => exit !== undefined || touchedSessions(env.HOME).some(id => !sessionsBeforeSwitch.has(id)),
          90000, 'adopted provider model session', screen)
      }
      // The wizard question disappears on one render; the status line that
      // reports the adopted route follows on another. Reading the screen once,
      // right here, is a race: ubuntu 24 passed it in the same run that ubuntu
      // 22 failed, with the whole wizard logged as complete before the read.
      await waitFor(() => exit !== undefined ||
        screenHas(verifyAgentTurn ? 'fixture-model' : `${routeName} · added`),
        20000, 'adopted provider route status', screen)
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
            10000, 'session composer after model switch', screen)
        }
      }
    } else {
      child.write('\u001b')
      await waitFor(() => exit !== undefined || !screenHas('Custom API endpoint'), 10000, 'provider wizard dismissal', screen)
      assert.equal(exit, undefined, `TUI exited while dismissing its provider wizard (code ${exit?.exitCode})`)
    }
    // Exercise the installed composer as a user would, without submitting a
    // message or touching a model endpoint. This is a black-box contract for
    // a future independently implemented input surface.
    await type('FQEDITXYZ')
    await waitFor(() => exit !== undefined || screen().includes('FQEDITXYZ'), 10000, 'typed draft', screen)
    assert.equal(exit, undefined, `TUI exited while typing a draft (code ${exit?.exitCode})`)
    child.write('\u001b[D\u007f')
    await waitFor(() => exit !== undefined || screen().includes('FQEDITXZ'), 10000, 'left-arrow and backspace editing', screen)
    assert.equal(exit, undefined, `TUI exited while editing a draft (code ${exit?.exitCode})`)
    child.write('\u0003')
    await waitFor(() => exit !== undefined || !screen().includes('FQEDITXZ'), 10000, 'draft clearing', screen)
    assert.equal(exit, undefined, `TUI exited while clearing a draft (code ${exit?.exitCode})`)
    child.write('/config')
    await waitFor(() => exit !== undefined || screen().includes('Show the active FlagQAI profile configuration'), 10000, 'config command selection', screen)
    child.write('\r')
    await waitFor(() => exit !== undefined || screen().replace(/\s+/gu, '').includes(profilePatch), 10000, 'active managed profile path', screen)
    assert.equal(exit, undefined, `TUI exited before /config reported its active profile (code ${exit?.exitCode})`)
    if (verifyAgentTurn) {
      child.write('Give a one-line acknowledgement for this local acceptance task.')
      await waitFor(() => exit !== undefined || screen().includes('local acceptance task'), 10000, 'agent task draft', screen)
      child.write('\r')
      await waitFor(() => exit !== undefined || (agentRequests.length > 0 && screen().includes('FLAGQAI_PTY_AGENT_READY')),
        90000, 'installed TUI Agent response', screen)
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
    await waitFor(() => exit !== undefined || (screen().includes('/exit') && screen().includes('Exit FlagQAI')), 10000, 'FlagQAI exit command selection', screen)
    assert.equal(exit, undefined, `TUI exited before /exit could be selected (code ${exit?.exitCode})`)
    child.write('\r')
    await waitFor(() => exit !== undefined, 30000, 'TUI exit', screen)
    assert.equal(exit.exitCode, 0, `TUI /exit returned ${exit.exitCode}; last screen:\n${screen()}`)
    assert.doesNotMatch(output, /UnhandledPromiseRejection|plugin tree failed to load/u)
    console.log(`PASS installed CLI TUI PTY: ${process.platform}/${process.arch}, draft edit/clear, provider routes${verifyAgentTurn ? ', local Agent turn' : ''}, and /exit returned 0`)
  } catch (error) {
    error.message += `\nLast screen:\n${screen()}\nOutput tail:\n${output.slice(-2000)}`
    throw error
  } finally {
    if (child && exit === undefined) {
      child.kill()
      await waitFor(() => exit !== undefined, 5000, 'PTY child termination', screen).catch(() => {})
    }
    terminal.dispose()
    if (endpoint) await new Promise(resolve => endpoint.close(resolve))
  }
}
