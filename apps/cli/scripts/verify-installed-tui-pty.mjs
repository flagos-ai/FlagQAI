/** Exercise the installed CLI in a real PTY without a live provider credential. */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
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

/**
 * Progress trace for the waits below.
 *
 * A failure from this file names the wait that did not complete, which on the
 * Windows runner has repeatedly been several steps away from the actual close:
 * the wizard can dismiss between two waits, and the error then describes the
 * symptom rather than the transition. Logging each wait as it starts and ends
 * puts the last thing that DID complete next to the failure.
 */
const traceStart = Date.now()
const trace = message => console.log(`[pty] ${message} (${Date.now() - traceStart}ms)`)

async function waitFor(check, timeoutMs, label, screenText) {
  trace(`wait ${label}`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) {
      trace(`ok ${label}`)
      return
    }
    await delay(100)
  }
  // Include what was on screen. A bare "timed out waiting for X" says the label
  // never appeared but not what did, which is the difference between "the app
  // is on the wrong screen" and "the text is drawn differently than expected".
  const tail = typeof screenText === 'function' ? screenText() : ''
  throw new Error(`Timed out waiting for ${label}${tail ? `\n--- screen ---\n${tail}` : ''}`)
}

/**
 * Like `waitFor`, but the condition has to keep holding for `holdMs`.
 *
 * For negative conditions — "this panel is gone", "this text is no longer
 * shown" — a single true reading proves nothing: the frame is being rewritten,
 * and the text can be absent from the buffer mid-repaint while the panel is
 * still up and still waiting for a key. Requiring the absence to survive a
 * short window turns the check into something only a real state change can
 * satisfy.
 */
async function waitForStable(check, holdMs, timeoutMs, label, screenText) {
  const deadline = Date.now() + timeoutMs
  let holdingSince
  while (Date.now() < deadline) {
    if (check()) {
      holdingSince ??= Date.now()
      if (Date.now() - holdingSince >= holdMs) return
    } else {
      holdingSince = undefined
    }
    await delay(50)
  }
  const tail = typeof screenText === 'function' ? screenText() : ''
  throw new Error(`Timed out waiting for ${label} to hold for ${holdMs}ms${tail ? `\n--- screen ---\n${tail}` : ''}`)
}

/**
 * Every `*.lock` file under the runtime root, with its recorded holder.
 *
 * `withFileLock` coordinates writers through a `<file>.lock` sibling naming the
 * holder PID, and a stale one costs a full 120 s wait before the writer gives
 * up. Listing them (and the PID they name) says whether a contended lock is
 * what a stalled write was waiting for.
 */
function describeLocks(root) {
  const found = []
  const walk = (dir, depth) => {
    if (depth > 3 || basename(dir) === 'node_modules') return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path, depth + 1)
      } else if (entry.name.endsWith('.lock')) {
        let holder = '?'
        try {
          holder = readFileSync(path, 'utf8').trim()
        } catch {}
        found.push(`${path} (holder pid ${holder})`)
      }
    }
  }
  walk(root, 0)
  return found.join('\n') || '(none)'
}

/**
 * List the runtime directory with sizes, plus which files mention the fixture
 * route. The wizard's writes are durable and land under here, so when the
 * screen no longer shows a wizard the files say which step ran.
 */
function describeRuntime(root) {
  const lines = []
  const walk = (dir, depth) => {
    // node_modules is tens of thousands of files and says nothing here. Depth
    // 4 covers `dsh/profiles/<profile>/` where the config editor keeps
    // `package.json.lock` — at depth 2 the lock listing could not see the very
    // lock a stalled write would be holding.
    if (depth > 4 || basename(dir) === 'node_modules') return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        lines.push(`${'  '.repeat(depth)}${entry.name}/`)
        walk(path, depth + 1)
        continue
      }
      let size = '?'
      let mentionsRoute = false
      try {
        const text = readFileSync(path, 'utf8')
        size = String(text.length)
        mentionsRoute = text.includes('fixture-gateway')
      } catch {
        try {
          size = String(statSync(path).size)
        } catch {}
      }
      lines.push(`${'  '.repeat(depth)}${entry.name} (${size}${mentionsRoute ? ', mentions fixture-gateway' : ''})`)
    }
  }
  walk(root, 0)
  return lines.join('\n') || '(empty)'
}

/**
 * Everything the app printed after `mark`, with escape sequences removed.
 *
 * The rendered screen at failure time is 30 s late — notifications have
 * expired and the frame has been redrawn. The raw stream keeps what was
 * actually written, including any error notification, which is the difference
 * between "the confirm cancelled the flow" and "the write failed".
 */
function plainSince(output, mark, droppedChars, limit = 6000) {
  const text = output.slice(Math.max(0, mark - droppedChars))
    .replace(/\u001b\[[0-9;?<>=]*[a-zA-Z]/gu, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .split('\n')
    .map(line => line.trim())
    // Drop pure frame furniture. A 1500-character tail once kept only the last
    // repaint and cut the notification that said what happened, so the dump
    // now keeps short diagnostic lines and bounds the total size instead.
    .filter(line => line !== '' && (line.length < 200 || /^\[|error|failed|cancel/i.test(line)))
    .join('\n')
  return text.length > limit ? `…${text.slice(-limit)}` : text || '(nothing)'
}

/**
 * Like `waitFor`, but answers whether the condition held instead of throwing.
 * For checks whose absence is itself one of several findings the caller wants
 * to tell apart.
 */
async function waitForOr(check, timeoutMs, label) {
  trace(`wait ${label}`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) {
      trace(`ok ${label}`)
      return true
    }
    await delay(100)
  }
  const held = check()
  trace(`${held ? 'ok' : 'no'} ${label}`)
  return held
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
  /** Set once the child is spawned; cleared in `finally`. */
  let tracePoller
  /**
   * Where the wizard writes its step trace, when tracing is asked for.
   *
   * A file, because `Ink.patchStderr` swallows `process.stderr.write` — a
   * stderr trace is recorded in the debug log and never reaches the terminal,
   * which is why the first version of this trace printed nothing for three
   * runs.
   */
  const wizardTracePath = process.env.FLAGQAI_DEBUG_PROVIDER_WIZARD === '1'
    ? join(env.FLAGQAI_CLI_RUNTIME_ROOT, 'provider-wizard-trace.log')
    : undefined
  // Tail of that file already echoed to this log.
  let wizardTracePrinted = 0
  const echoWizardTrace = () => {
    if (wizardTracePath === undefined) return
    let text
    try {
      text = readFileSync(wizardTracePath, 'utf8')
    } catch {
      return
    }
    if (text.length <= wizardTracePrinted) return
    for (const line of text.slice(wizardTracePrinted).split('\n')) {
      if (line.trim() !== '') console.log(`[tui] provider-wizard ${line.trim()}`)
    }
    wizardTracePrinted = text.length
  }
  /**
   * The wizard's last recorded step, once the settings write has settled one
   * way or the other; undefined while it is still pending.
   */
  const wizardTraceSince = () => {
    if (wizardTracePath === undefined) return undefined
    let text
    try {
      text = readFileSync(wizardTracePath, 'utf8')
    } catch {
      return undefined
    }
    const match = /^.*(settings mutate (?:done|failed|threw)).*$/mu.exec(text)
    return match?.[1]
  }
  const wizardLastStep = () => {
    if (wizardTracePath === undefined) return '(no trace)'
    try {
      const lines = readFileSync(wizardTracePath, 'utf8').trim().split('\n')
      return lines.at(-1)?.trim() ?? '(empty)'
    } catch {
      return '(no trace)'
    }
  }
  // Monotonic count of characters dropped off the front of `output`. `output`
  // is a ring buffer, so any index into it goes stale the moment the cap is
  // reached — a mark taken as `output.length` stays at the cap forever and
  // `slice(mark)` is then always empty. That is how run 40668237150 reported
  // "(nothing)" for a window in which the app had plainly printed.
  let droppedChars = 0
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
      env: {
        ...env,
        TERM: 'xterm-256color', FLAGQAI_LANG: 'en', DSH_TELEMETRY_MODE: 'DISABLED',
        ...(wizardTracePath === undefined ? {} : { FLAGQAI_PROVIDER_WIZARD_TRACE: wizardTracePath }),
      },
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
    // Poll the trace file so its lines appear in the job log while the run is
    // still going, not only in a failure dump.
    tracePoller = setInterval(echoWizardTrace, 500)
    tracePoller.unref?.()
    child.onData(data => {
      lastOutputAt = Date.now()
      output += data
      if (output.length > 128 * 1024) {
        const cut = output.length - 128 * 1024
        output = output.slice(cut)
        droppedChars += cut
      }
      // Print the wizard's own step trace as it arrives. Waiting for the
      // failure dump to show it is how three runs in a row reported nothing
      // while the flow was in fact tracing.
      for (const line of String(data).matchAll(/\[provider-wizard\][^\r\n]{0,120}/gu)) {
        console.log(`[tui] ${line[0]}`)
      }
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
      // On Windows a written escape sequence is not reliably delivered as one
      // key. Runs 40622665008, 40625474325 and 40633146024 all ended on the
      // launchpad with an empty composer — the screen `runAddFlow` leaves when
      // it reads Escape — and the failure was identical on every one of three
      // retries, which is a deterministic split, not a race.
      //
      // The parser is not at fault. Probed directly: fed `ESC`, `[`, `B` as
      // three reads it still yields one Down key; fed `ESC`, flushed, then the
      // rest, it yields an Escape key followed by the literal text. Both are
      // the parser doing its job. What decides the outcome is how long the
      // ESC is held before the remainder arrives, and the ESC window is 50 ms.
      //
      // A win32-input-mode record has a much wider window (WIN32_INPUT_GRACE_MS
      // is 1000 ms), and the parser accepts one split into single bytes. If
      // ConPTY delivers the bytes we write, that record is the robust form. If
      // ConPTY instead re-encodes each byte into its own key event, the record
      // arrives as garbage. One attempt cannot tell those apart, so the
      // attempts alternate and the failure names what was tried.
      const DOWN_RECORD = '\u001b[40;80;0;1;0;1_'
      const arrowForms = process.platform === 'win32'
        ? [
            { label: 'a win32-input-mode record', bytes: DOWN_RECORD },
            { label: 'a raw escape sequence', bytes: '\u001b[B' },
            { label: 'a win32-input-mode record', bytes: DOWN_RECORD },
          ]
        : [{ label: 'a raw escape sequence', bytes: '\u001b[B' }]
      let movedToCustom = false
      const tried = []
      for (const form of arrowForms) {
        child.write(form.bytes)
        movedToCustom = await waitForOr(() => exit !== undefined || screenHas('❯ ● Custom API endpoint'), 8000, 'arrow moved focus')
        if (movedToCustom) {
          tried.push(`${form.label}: moved`)
          break
        }
        tried.push(`${form.label}: no move`)
        if (form === arrowForms.at(-1)) break
        const stillChoosing = screenHas('Built-in provider') || screenHas('Custom API endpoint')
        if (stillChoosing) {
          throw new Error('the Down arrow did not move the route choice: the option list is still on screen '
            + `with the focus elsewhere, after ${form.label}\n--- screen ---\n` + screen())
        }
        // Re-entering the wizard is safe: nothing has been persisted at this
        // point, and Escape on a non-empty draft clears whatever debris the
        // split left in the composer.
        trace(`arrow form failed: ${form.label}`)
        child.write('\u001b')
        await waitForOr(() => !screen().includes('[B') && !screen().includes('[40;80'), 2000, 'arrow debris cleared')
        await openProviderWizard()
      }
      if (!movedToCustom) {
        throw new Error('the route choice screen did not advance on any Down arrow form '
          + `(${tried.join('; ')}). Either ConPTY re-encodes the bytes we write into separate`
          + ' key events, so no written form can carry an arrow, or the ESC flush window is'
          + ' being crossed every time.\n--- screen ---\n' + screen())
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
      // Enter is only meaningful once the options are on screen: the panel
      // takes submitOptions on Enter, and that reads the focused row. Waiting
      // for the header alone let the key race the rows, the same way the
      // route arrow raced its list.
      await waitFor(() => exit !== undefined || /❯\s*●\s*Write and enable/u.test(screen()), 10000, 'provider confirmation choices', screen)
      child.write('\r')
      const confirmMark = droppedChars + output.length
      // The switch question is conditional (`!deps.working() && models.length >
      // 0`) and transient: it is asked after the profile write, and a stray
      // second Enter answers it before it can be read. Its absence is therefore
      // not by itself a failure — the credential file is what says whether the
      // add flow actually wrote.
      const askCredential = async () => {
        const path = join(env.FLAGQAI_CLI_RUNTIME_ROOT, 'dsh', '.credentials.yaml')
        try {
          return (await readFile(path, 'utf8')).includes('fixture-secret-never-send')
            ? 'written with the key'
            : 'present without the key'
        } catch {
          return 'absent'
        }
      }
      // Wait for the switch question on its own merits. An earlier version
      // also returned as soon as the launchpad was visible, to fail fast when
      // the wizard had closed — but the launchpad is *always* visible behind
      // the wizard, so that condition was true the moment the confirmation
      // panel unmounted, before this question had rendered. The wait then gave
      // up, skipped its Enter, and the panel appeared afterwards and sat
      // unanswered: ubuntu 22 and macOS run 40642249333 both logged the NOTE
      // and then timed out 90 s later with the board still on screen. The
      // launchpad state is only used below, to describe a failure.
      // 150 s on Windows, not 30. The credential store serializes writers
      // through `withFileLock(..., { waitMs: 120_000 })`, so a contended write
      // legitimately takes up to two minutes before it either succeeds or
      // raises the lock-timeout error the wizard would then report. Waiting
      // 30 s and killing the app cannot observe either outcome — it only sees
      // "nothing yet", which is what runs 40648607421 and 40655515845 both
      // reported. On Unix the question arrives in under a second, so the
      // longer bound costs nothing there.
      const switchWaitMs = process.platform === 'win32' ? 150_000 : 30_000
      const switchQuestionShown = await waitForOr(
        () => exit !== undefined || screenHas('Switch to the new provider now?'), switchWaitMs, 'provider switch question')
      if (!switchQuestionShown) {
        // The trace put the stall inside `settings.mutate` — the kernel's
        // config editor, which recomposes the whole plugin tree. "No answer
        // yet" and "never answers" are different findings, and only time
        // separates them, so give it a further four minutes and report which
        // of the two happened instead of guessing from the absence.
        const settled = await waitForOr(
          () => exit !== undefined || wizardTraceSince() !== undefined,
          process.platform === 'win32' ? 240_000 : 60_000, 'settings mutate settled')
        // Is the app even alive? A keystroke it echoes proves the event loop
        // is turning, so the wizard promise alone is pending; no echo means
        // the loop is blocked inside whatever the confirmation started. Runs
        // 40655515845 answered "responds" at 51 s, which rules out a blocking
        // write and points at an await that has not settled yet.
        const PROBE = 'FQPROBE'
        for (const character of PROBE) child.write(character)
        const echoed = await waitForOr(() => exit !== undefined || screenHas(PROBE), 5000, 'app echoed a keystroke')
        const credential = await askCredential()
        if (credential !== 'written with the key') {
          throw new Error(`the wizard closed without writing the provider `
            + `(credential file: ${credential}; app ${echoed ? 'still responds to keys' : 'stopped responding to keys'}; `
            + `settings write ${settled ? `settled: ${wizardTraceSince()}` : 'still pending after the extra wait'}; `
            + `last wizard step: ${wizardLastStep()})\n`
            + `--- lock files ---\n${describeLocks(env.FLAGQAI_CLI_RUNTIME_ROOT)}\n`
            + `--- runtime tree ---\n${describeRuntime(env.FLAGQAI_CLI_RUNTIME_ROOT)}\n`
            + `--- output since the confirmation Enter ---\n${plainSince(output, confirmMark, droppedChars)}\n`
            + `--- screen now ---\n` + screen())
        }
        // The write landed, so the wizard ran to the end; the question was
        // either skipped by its own condition or answered before this read.
        // Continue to the durable assertions rather than gambling on seeing a
        // transient panel.
        console.log('NOTE: the switch question was not shown; the provider was written')
      }
      const sessionsBeforeSwitch = new Set(touchedSessions(env.HOME))
      if (switchQuestionShown) {
        if (!verifyAgentTurn) {
          child.write('\u001b[B')
          await waitFor(() => exit !== undefined || /❯\s*● Keep the current model/u.test(screen()), 10000, 'keep-current-model choice', screen)
        }
        child.write('\r')
        // The panel is inside a repainting frame, so "not on screen" is true
        // for a moment even when the question is still unanswered — and a
        // spurious pass here leaves the app waiting on a keyboard that will
        // never arrive. Require the absence to hold before treating the
        // question as answered.
        await waitForStable(() => exit !== undefined || !screenHas('Switch to the new provider now?'),
          1500, 15000, 'completed provider wizard', screen)
      }
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
    echoWizardTrace()
    error.message += `\nLast screen:\n${screen()}\nOutput tail:\n${output.slice(-2000)}`
    throw error
  } finally {
    if (tracePoller !== undefined) clearInterval(tracePoller)
    if (child && exit === undefined) {
      child.kill()
      await waitFor(() => exit !== undefined, 5000, 'PTY child termination', screen).catch(() => {})
    } else if (child && process.platform === 'win32') {
      // node-pty 1.1.0 closes its output socket on natural exit, but only kill()
      // disposes the ConPTY worker. Release it after checking the real exit code.
      child.kill()
    }
    terminal.dispose()
    if (endpoint) await new Promise(resolve => endpoint.close(resolve))
  }
}
