import { createInterface } from 'node:readline/promises'
import { randomUUID } from 'node:crypto'

import { ATTACH_HELP, parseAttachArgs } from './attach-args.js'
import { createImageDraftQueue, handleImageDraftCommand } from './attach-image-drafts.js'

const textFromBlocks = blocks => Array.isArray(blocks)
  ? blocks.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('')
  : ''

const sdkPath = '../lib/flagqai-platform/sdk/index.mjs'
export const loadAttachSdk = () => import(sdkPath)

export const ATTACH_INTERACTIVE_HELP = `Local commands:
  /help                 Show these commands
  /config               Show the attached session and current model
  /status               Show the Harness session status
  /model [number]       List or switch available Harness models
  /plan [on|off]        Inspect or change Harness plan mode
  /mode [number]        List or change Harness modes
  /effort [number|auto] List or change Harness effort
  /image <path>         Attach a local image draft; /image lists drafts
  /image remove <n>    Remove a draft; /image clear removes all
  /cancel               Request cancellation of the active turn
  /dispose              Dispose the attached session
  /exit, /quit          Detach from this session`

export function formatAttachConfig({ baseUrl, session, models }) {
  const model = models?.available && typeof models.current?.model === 'string'
    ? [models.current.provider, models.current.model].filter(Boolean).join('/')
    : undefined
  return `Attached service: ${new URL(baseUrl).origin}\n` +
    `Backend: ${JSON.stringify(session.backendId)}\n` +
    `Session: ${JSON.stringify(session.sessionId)} · resource ${JSON.stringify(session.id)}\n` +
    `Workspace: ${JSON.stringify(session.cwd)}\n` +
    `Status: ${JSON.stringify(session.status)}\n` +
    `Model: ${model === undefined ? models?.available ? 'unset' : 'unavailable' : JSON.stringify(model)}\n`
}

export function createEventRenderer({ json = false, write }) {
  const attemptPositions = new Map()
  const streamedText = new Map()
  const position = event => Number.isSafeInteger(event.turn) && Number.isSafeInteger(event.step)
    ? `turn:${event.turn}:step:${event.step}`
    : attemptPositions.get(event.attemptId) ?? event.attemptId
  const tools = new Map()
  let lastQueue = '[]'
  let lastControl
  return record => {
    if (json) {
      write(`${JSON.stringify(record)}\n`)
      return
    }
    const event = record.event
    if (event.type === 'pending.changed') {
      const queue = JSON.stringify(event.items)
      if (queue !== lastQueue) {
        lastQueue = queue
        write(`\n[queue] ${event.items.length} pending\n`)
        for (const item of event.items) write(`[${item.placement === 'steer' ? 'next step' : 'next task'}] ${item.text}\n`)
      }
    } else if (event.type === 'session.control') {
      const status = JSON.stringify([event.state, event.outcome, event.stillQueued])
      if (status !== lastControl && event.state !== 'none') {
        write(`\n[stop] ${event.state}${event.outcome ? ` · queue withdrawal ${event.outcome}` : ''}${event.stillQueued?.length ? ` · ${event.stillQueued.length} may still run` : ''}\n`)
      }
      lastControl = status
    } else if (event.type === 'assistant.attempt.start') {
      attemptPositions.set(event.attemptId, position(event))
    } else if (event.type === 'assistant.delta' && event.delta?.kind === 'text') {
      // Durable history already contains settled messages. Replaying both
      // deltas and messages duplicates text when their attempt IDs differ.
      if (record.meta?.replay === true) return
      const key = position(event)
      streamedText.set(key, (streamedText.get(key) ?? '') + event.delta.text)
      write(event.delta.text)
    } else if (event.type === 'assistant.message') {
      const key = position(event)
      const text = textFromBlocks(event.blocks)
      const streamed = streamedText.get(key) ?? ''
      if (text.startsWith(streamed)) write(text.slice(streamed.length))
      else if (text !== '') write(`\n[updated answer]\n${text}`)
      streamedText.delete(key)
      for (const [attempt, item] of attemptPositions) if (item === key) attemptPositions.delete(attempt)
      write('\n')
    } else if (event.type === 'tool.call') {
      tools.set(event.callId, event.name)
      write(`\n[tool] ${event.name}\n`)
    } else if (event.type === 'tool.result') {
      const name = tools.get(event.callId) ?? event.callId
      write(`[tool ${event.isError ? 'failed' : 'done'}] ${name}\n`)
    } else if (event.type === 'notice') {
      write(`[${event.level}] ${event.text}\n`)
    }
  }
}

const numberedOptions = options => options.map((option, index) => `  ${index + 1}. ${option.label ?? option.kind}`).join('\n')

/** Build the human-in-the-loop handler shared by one-shot and interactive attach. */
export function createInteractionResponder({ client, sessionId, ask, askChoice, askQuestionChoice, askMultiQuestionChoice, askSecret, write, warn }) {
  const answerPermission = async request => {
    write(`\nPermission required · ${request.toolName}\n`)
    if (request.command) write(`${request.command}\n`)
    if (request.reason) write(`${request.reason}\n`)
    if (ask === undefined) {
      warn('FlagQAI attach: rejecting a permission request because no interactive terminal is available\n')
      await client.answerPermission(sessionId, request.requestId, {
        kind: 'reject',
        message: 'No interactive terminal was available to approve this request.',
      })
      return
    }
    const options = Array.isArray(request.options) && request.options.length > 0
      ? request.options
      : [{ id: 'allow-once', kind: 'allow-once' }, { id: 'reject', kind: 'reject' }]
    if (askChoice === undefined) write(`${numberedOptions(options)}\n`)
    while (true) {
      const raw = (await (askChoice
        ? askChoice('Choose an option: ', options)
        : ask('Choose an option: '))).trim()
      const option = options[Number(raw) - 1]
      if (option === undefined) {
        write('Enter the number of one listed option.\n')
        continue
      }
      if (option.kind === 'allow-once') {
        await client.answerPermission(sessionId, request.requestId, { kind: 'allow-once' })
      } else if (option.kind === 'allow-always') {
        await client.answerPermission(sessionId, request.requestId, { kind: 'allow-always', optionId: option.id })
      } else {
        const message = (await ask('Reason (optional): ')).trim()
        await client.answerPermission(sessionId, request.requestId, {
          kind: 'reject',
          ...(message === '' ? {} : { message }),
        })
      }
      return
    }
  }

  const answerQuestions = async request => {
    write(`\nQuestion${request.questions.length === 1 ? '' : 's'} required\n`)
    if (ask === undefined || (askSecret === undefined && request.questions.some(question => question.secret === true))) {
      warn(`FlagQAI attach: cancelling question request ${request.requestId} because ${ask === undefined ? 'no interactive terminal is available' : 'secret input is not supported by this terminal client'}\n`)
      await client.cancelQuestion(sessionId, request.requestId)
      return
    }
    const answers = []
    for (const [questionIndex, question] of request.questions.entries()) {
      write(`${questionIndex + 1}. ${question.question}\n`)
      if (question.detail) write(`${question.detail}\n`)
      const menuEligible = question.secret !== true && question.options.length > 0 &&
        (question.multiSelect === true ? askMultiQuestionChoice !== undefined : askQuestionChoice !== undefined)
      if (question.options.length > 0 && !menuEligible) write(`${numberedOptions(question.options)}\n`)
      while (true) {
        const prompt = question.options.length === 0
          ? 'Answer: '
          : question.multiSelect === true ? 'Choose number(s), comma-separated, or type an answer: ' : 'Choose a number or type an answer: '
        let entered = menuEligible
          ? await (question.multiSelect === true ? askMultiQuestionChoice : askQuestionChoice)(
            prompt, question.options, question.hideCustomInput !== true)
          : await (question.secret === true ? askSecret : ask)(prompt)
        const chosenCustom = menuEligible && entered === '0'
        if (chosenCustom) entered = await ask('Answer: ')
        const raw = question.secret === true ? entered : entered.trim()
        const indexes = raw.split(',').map(value => Number(value.trim()) - 1)
        const numeric = !chosenCustom && raw !== '' && indexes.every(index => Number.isInteger(index) && question.options[index] !== undefined)
        const selected = numeric ? indexes.map(index => question.options[index].label) : []
        const custom = numeric ? undefined : raw
        if (new Set(selected).size !== selected.length) {
          write('Do not select the same option more than once.\n')
          continue
        }
        if (question.multiSelect !== true && selected.length > 1) {
          write('Choose only one option.\n')
          continue
        }
        if (question.hideCustomInput === true && !numeric) {
          write('This question accepts only one of the listed options.\n')
          continue
        }
        if (selected.length === 0 && custom === '') {
          write('An answer is required.\n')
          continue
        }
        answers.push({ selected, ...(custom === undefined ? {} : { custom }) })
        break
      }
    }
    await client.answerQuestion(sessionId, request.requestId, { answers })
  }

  return async record => {
    if (record.event.type === 'permission.request') await answerPermission(record.event.request)
    else if (record.event.type === 'question.request') await answerQuestions(record.event.request)
  }
}

const describeError = error => {
  if (typeof error?.code === 'string' && typeof error?.message === 'string') {
    return `${error.code}: ${error.message}`
  }
  return error instanceof Error ? error.message : String(error)
}

/** Apply only controls advertised by the live Harness session. */
export async function handleNativeControlCommand(line, { client, sessionId, signal, write, warn }) {
  const match = /^\/(plan|mode|effort)(?:\s+(.*))?$/u.exec(line)
  if (!match) return false
  const [, kind, rawChoice] = match
  const choice = rawChoice?.trim() ?? ''
  let selected
  const controls = await client.getSessionControls(sessionId, { signal })
  const control = controls[kind]
  if (!control?.available) {
    write(`${kind} is unavailable for this Harness session.\n`)
    return true
  }
  if (kind === 'plan') {
    if (choice === '') {
      write(`Plan mode: ${control.pending === null ? control.active ? 'on' : 'off' : `pending ${control.pending ? 'on' : 'off'}`} · use /plan on or /plan off.\n`)
      return true
    }
    if (choice !== 'on' && choice !== 'off') {
      write('Use /plan on or /plan off.\n')
      return true
    }
  } else {
    const options = Array.isArray(control.options) ? control.options.slice(0, 256).filter(option =>
      typeof option?.id === 'string' && option.id.length > 0 && option.id.length <= 512) : []
    if (choice === '') {
      write(`Available ${kind} choices:\n`)
      for (const [index, option] of options.entries()) {
        write(`${index + 1}. ${JSON.stringify(option.label ?? option.id)}${option.id === control.current ? ' (current)' : ''}\n`)
      }
      if (kind === 'effort') write(`auto. Let Harness choose${control.current === null ? ' (current)' : ''}\n`)
      write(`Use /${kind} <number>${kind === 'effort' ? ' or /effort auto' : ''}.\n`)
      return true
    }
    if (!(kind === 'effort' && choice === 'auto') && (!/^[1-9]\d*$/u.test(choice) || Number(choice) > options.length)) {
      write(`Choose a number from /${kind}${kind === 'effort' ? ' or auto' : ''}.\n`)
      return true
    }
    selected = kind === 'effort' && choice === 'auto' ? null : options[Number(choice) - 1].id
  }
  try {
    const updated = kind === 'plan'
      ? await client.setSessionPlan(sessionId, { active: choice === 'on' }, { signal })
      : await client.setSessionControl(sessionId, { kind, id: selected }, { signal })
    const state = updated[kind]
    write(`${kind} set to ${kind === 'plan' ? state.pending === null ? state.active ? 'on' : 'off' : `pending ${state.pending ? 'on' : 'off'}` : state.current ?? 'auto'}.\n`)
  } catch (error) {
    if (!signal?.aborted && ['session_busy', 'control_failed', 'plan_failed', 'control_unsupported', 'plan_unsupported', 'invalid_control'].includes(error?.code)) {
      warn(`FlagQAI attach: ${describeError(error)} Current session retained.\n`)
      return true
    }
    throw error
  }
  return true
}

export async function runAttachCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout
  const stderr = io.stderr ?? process.stderr
  const stdin = io.stdin ?? process.stdin
  let parsed
  try {
    parsed = parseAttachArgs(argv, io.cwd ?? process.cwd())
  } catch (error) {
    stderr.write(`FlagQAI attach: ${describeError(error)}\n`)
    return 2
  }
  if (parsed.help) {
    stdout.write(`${ATTACH_HELP}\n`)
    return 0
  }

  const { createFlagQaiClient, FLAGQAI_SDK_PROTOCOL_VERSION } = await loadAttachSdk()
  const client = createFlagQaiClient({ baseUrl: parsed.baseUrl, fetch: io.fetch })
  const controller = new AbortController()
  let session
  let turnWaiter
  let streamFailure
  let terminal
  let mainPromptController
  let exitCode
  let stopWork = Promise.resolve()
  let taskTimer
  let pendingRecoveryNotified = false
  const signalSource = io.signalSource ?? process
  const recovery = () => session === undefined ? '' : io.recoveryCommand
    ? ` ${io.recoveryCommand(session)}`
    : ` Reattach: flagqai attach ${client.baseUrl} --resource ${session.id}. After a server restart use --backend ${session.backendId} --session ${session.sessionId} with the original --cwd.`
  const preservePendingWork = () => {
    if (pendingRecoveryNotified || session === undefined) return
    pendingRecoveryNotified = true
    io.onDetachWithPendingWork?.(session, client.baseUrl)
  }
  const failStream = error => {
    if (turnWaiter !== undefined) preservePendingWork()
    streamFailure = error
    turnWaiter?.reject(error)
    turnWaiter = undefined
    controller.abort(error)
    mainPromptController?.abort(error)
    terminal?.close()
  }
  const stop = signal => {
    if (exitCode !== undefined) return
    exitCode = signal === 'SIGINT' ? 130 : 143
    const cancelling = signal === 'SIGINT' && turnWaiter !== undefined
    // Detach first so a missing cancellation receipt cannot keep the client alive.
    failStream(new Error(cancelling ? 'Interrupted; requesting task cancellation.' : 'Detached; server work may continue.'))
    if (cancelling) {
      stopWork = client.cancelSession(session.id, { cause: 'interrupt' }, { signal: AbortSignal.timeout(5000) })
        .then(receipt => stderr.write(`FlagQAI attach: cancellation ${receipt.outcome}; inspect session state before retrying.${recovery()}\n`))
        .catch(() => stderr.write(`FlagQAI attach: cancellation could not be confirmed; server work may continue.${recovery()}\n`))
    } else stderr.write(`FlagQAI attach: detached; server work may continue.${recovery()}\n`)
  }
  const interrupt = () => stop('SIGINT')
  const terminate = () => stop('SIGTERM')
  signalSource.on('SIGINT', interrupt)
  signalSource.on('SIGTERM', terminate)
  try {
    try {
      const health = await client.health({ signal: controller.signal })
      if (health.protocolVersion !== FLAGQAI_SDK_PROTOCOL_VERSION) {
        throw new Error(`protocol mismatch: client ${FLAGQAI_SDK_PROTOCOL_VERSION}, server ${health.protocolVersion}`)
      }
      if (parsed.resourceId !== undefined) {
        session = await client.getSession(parsed.resourceId, { signal: controller.signal })
      } else {
        const backends = await client.listBackends({ signal: controller.signal })
        const backend = backends.find(item => item.id === parsed.backendId)
        if (backend === undefined) throw new Error(`backend "${parsed.backendId}" is not available`)
        if (!backend.detection.installed) {
          throw new Error(backend.detection.hint ?? `backend "${parsed.backendId}" is not installed`)
        }
        session = await client.openSession({
          backendId: parsed.backendId,
          cwd: parsed.cwd,
          ...(parsed.sessionId === undefined ? {} : { sessionId: parsed.sessionId }),
        }, { signal: controller.signal })
      }
    } catch (error) {
      stderr.write(`FlagQAI attach: ${describeError(error)}\n`)
      return exitCode ?? 1
    }

    if (!parsed.json) {
      stdout.write(`Connected to ${client.baseUrl}\n`)
      stdout.write(`Resource ${session.id} · ${session.backendId} session ${session.sessionId}\n`)
      stdout.write(`${io.recoveryCommand ? io.recoveryCommand(session) : `Reattach: flagqai attach ${client.baseUrl} --resource ${session.id}`}\n`)
    }

    terminal = stdin.isTTY && !parsed.json
      ? (io.createTerminal?.({ input: stdin, output: stdout }) ?? createInterface({ input: stdin, output: stdout, terminal: true }))
      : undefined
    terminal?.on('SIGINT', interrupt)
    terminal?.on('SIGTERM', terminate)
    const imageDrafts = createImageDraftQueue({ cwd: io.cwd ?? process.cwd() })
    let interactionTail = Promise.resolve()
    const makeResponder = () => createInteractionResponder({
      client,
      sessionId: session.id,
      ask: terminal === undefined ? undefined : prompt => terminal.question(prompt, { signal: controller.signal }),
      askChoice: typeof terminal?.choosePermission === 'function'
        ? (prompt, options) => terminal.choosePermission(prompt, options, { signal: controller.signal }) : undefined,
      askQuestionChoice: typeof terminal?.chooseQuestion === 'function'
        ? (prompt, options, allowCustom) => terminal.chooseQuestion(prompt, options, {allowCustom, signal: controller.signal}) : undefined,
      askMultiQuestionChoice: typeof terminal?.chooseMultiQuestion === 'function'
        ? (prompt, options, allowCustom) => terminal.chooseMultiQuestion(prompt, options, {allowCustom, signal: controller.signal}) : undefined,
      askSecret: typeof terminal?.questionSecret === 'function'
        ? prompt => terminal.questionSecret(prompt, { signal: controller.signal }) : undefined,
      write: value => stdout.write(value),
      warn: value => stderr.write(value),
    })
    let responder = makeResponder()

    let liveTurn
    let streamController
    let stream
    const waitForTurn = clientMessageId => new Promise((resolve, reject) => {
      turnWaiter = { clientMessageId, turn: undefined, resolve, reject }
    })
    const makeRenderer = () => createEventRenderer({ json: parsed.json, write: io.eventWrite ?? (value => stdout.write(value)) })
    let render = makeRenderer()
    const startStream = () => {
      const readController = new AbortController()
      streamController = readController
      const signal = AbortSignal.any([controller.signal, readController.signal])
      return (async () => {
        try {
          for await (const record of client.events(session.id, { signal })) {
            io.onEvent?.(record)
            render(record)
            if (record.meta?.replay !== true && record.event.type === 'turn.start') liveTurn = record.event.turn
            if (record.event.type === 'permission.request' || record.event.type === 'question.request') {
              mainPromptController?.abort()
              const responding = interactionTail.then(() => responder(record))
              interactionTail = responding.catch(() => undefined)
              await responding
            }
            if (
              turnWaiter !== undefined
              && record.event.type === 'turn.start'
              && record.event.userMessageId === turnWaiter.clientMessageId
            ) {
              turnWaiter.turn = record.event.turn
            } else if (
              turnWaiter !== undefined
              && record.event.type === 'user.message'
              && record.event.id === turnWaiter.clientMessageId
              && (typeof record.event.turn === 'number' || liveTurn !== undefined)
            ) {
              turnWaiter.turn = record.event.turn ?? liveTurn
            } else if (
              turnWaiter !== undefined
              && record.event.type === 'turn.end'
              && record.event.turn === turnWaiter.turn
            ) {
              const waiter = turnWaiter
              turnWaiter = undefined
              const reason = record.event.reason
              if (reason?.kind === 'completed') waiter.resolve()
              else waiter.reject(new Error(`task ${reason?.kind ?? 'ended without a completion reason'}${
                typeof reason?.message === 'string' ? `: ${reason.message}`
                  : typeof reason?.detail === 'string' ? `: ${reason.detail}` : ''
              }. Reattach to inspect the session before retrying.`))
            }
          }
          if (!signal.aborted) failStream(new Error('Event stream closed before the client detached; task completion is unknown.'))
        } catch (error) {
          if (!signal.aborted) failStream(error)
        }
      })()
    }
    stream = startStream()
    void stream.catch(() => undefined)

    const submit = async text => {
      if (streamFailure !== undefined) throw streamFailure
      const clientMessageId = randomUUID()
      const waiting = waitForTurn(clientMessageId)
      if (parsed.timeoutSeconds !== undefined) taskTimer = setTimeout(() => failStream(new Error('Task deadline reached; detached without cancelling. Server work may continue.')), parsed.timeoutSeconds * 1000)
      // The stream may fail before the POST receipt arrives.
      void waiting.catch(() => undefined)
      let receipt
      try {
        receipt = await client.submitMessage(session.id, {
          clientMessageId,
          text,
          placement: 'turn',
          ...(imageDrafts.list().length ? { images: imageDrafts.payload() } : {}),
        }, { signal: controller.signal })
      } catch (error) {
        // The server may have accepted the POST even when its receipt was lost.
        preservePendingWork()
        turnWaiter = undefined
        throw error
      }
      if (!receipt.accepted) {
        turnWaiter = undefined
        throw new Error(receipt.reason ?? 'the session rejected the message')
      }
      imageDrafts.clear()
      return waiting
    }

    try {
      if (parsed.prompt !== undefined) {
        await submit(parsed.prompt)
        controller.abort()
        await stream
        terminal?.close()
        return 0
      }
      if (terminal === undefined) {
        throw new Error('interactive attach requires a terminal; use --prompt or -- <prompt>')
      }
      try {
        while (true) {
          await interactionTail
          const promptController = new AbortController()
          mainPromptController = promptController
          let line
          try {
            line = (await terminal.question('> ', { signal: promptController.signal })).trim()
          } catch (error) {
            if (controller.signal.aborted) throw controller.signal.reason
            if (promptController.signal.aborted) continue
            throw error
          } finally {
            if (mainPromptController === promptController) mainPromptController = undefined
          }
          if (line === '') continue
          if (line === '/exit' || line === '/quit') break
          if (line === '/help') {
            stdout.write(`${ATTACH_INTERACTIVE_HELP}\n`)
            continue
          }
          if (line === '/config') {
            const current = await client.getSession(session.id, { signal: controller.signal })
            const models = await client.listSessionModels(session.id, { signal: controller.signal })
              .catch(() => ({ available: false }))
            stdout.write(formatAttachConfig({ baseUrl: client.baseUrl, session: current, models }))
            continue
          }
          if (line === '/cancel') {
            const receipt = await client.cancelSession(session.id, { cause: 'interrupt' })
            stdout.write(`Cancellation ${receipt.outcome}\n`)
            continue
          }
          if (line === '/status') {
            const current = await client.getSession(session.id)
            stdout.write(`${current.status} · ${current.backendId} session ${current.sessionId}\n`)
            continue
          }
          if (await handleNativeControlCommand(line, {
            client, sessionId: session.id, signal: controller.signal,
            write: value => stdout.write(value), warn: value => stderr.write(value),
          })) continue
          if (await handleImageDraftCommand(line, {
            queue: imageDrafts, client, sessionId: session.id, signal: controller.signal,
            write: value => stdout.write(value), warn: value => stderr.write(value),
          })) continue
          if (line === '/model' || /^\/model\s/u.test(line)) {
            const models = await client.listSessionModels(session.id, { signal: controller.signal })
            if (!models.available) {
              stdout.write('Model selection is unavailable for this session.\n')
              continue
            }
            const available = Array.isArray(models.models) ? models.models.slice(0, 256).filter(model =>
              typeof model?.id === 'string' && model.id.length > 0 && model.id.length <= 512 &&
              (model.provider === undefined || typeof model.provider === 'string' && model.provider.length <= 512)) : []
            const label = model => JSON.stringify([model.provider, model.id].filter(Boolean).join('/'))
            if (line === '/model') {
              stdout.write(available.length ? 'Available models:\n' : 'No models are available.\n')
              for (const [index, model] of available.entries()) {
                const current = model.id === models.current?.model && model.provider === models.current?.provider
                stdout.write(`${index + 1}. ${label(model)}${current ? ' (current)' : ''}\n`)
              }
              if (available.length) stdout.write('Use /model <number> to switch the idle Harness session.\n')
              continue
            }
            const choice = line.slice('/model'.length).trim()
            if (!/^[1-9]\d*$/u.test(choice) || Number(choice) > available.length) {
              stdout.write('Choose a number from /model.\n')
              continue
            }
            const selected = available[Number(choice) - 1]
            streamController.abort()
            await stream
            try {
              session = await client.switchSessionModel(session.id, {
                ...(selected.provider === undefined ? {} : { provider: selected.provider }),
                model: selected.id,
              }, { signal: controller.signal })
            } catch (error) {
              if (!controller.signal.aborted && ['session_busy', 'model_switch_failed'].includes(error?.code)) {
                stream = startStream()
                void stream.catch(() => undefined)
                stderr.write(`FlagQAI attach: ${describeError(error)} Current session retained.\n`)
                continue
              }
              throw error
            }
            if (imageDrafts.list().length) {
              imageDrafts.clear()
              stdout.write('Pending images cleared after model switch.\n')
            }
            liveTurn = undefined
            render = makeRenderer()
            responder = makeResponder()
            stream = startStream()
            void stream.catch(() => undefined)
            const notice = `Model switched to ${label(selected)} · resource ${session.id}\n${
              io.recoveryCommand ? io.recoveryCommand(session)
                : `Reattach: flagqai attach ${client.baseUrl} --resource ${session.id}`}\n`
            if (io.onSessionSwitched) io.onSessionSwitched(notice)
            else stdout.write(notice)
            continue
          }
          if (line === '/dispose') {
            await client.disposeSession(session.id)
            stdout.write('Session resource disposed\n')
            break
          }
          await submit(line)
        }
      } finally {
        terminal.close()
      }
      controller.abort()
      await stream
      return 0
    } catch (error) {
      controller.abort()
      await stream.catch(() => undefined)
      terminal?.close()
      if (exitCode === undefined) stderr.write(`FlagQAI attach: ${describeError(error)}${recovery()} Inspect the session before retrying; no message was automatically resubmitted.\n`)
      return exitCode ?? 1
    }
  } finally {
    controller.abort()
    terminal?.close()
    signalSource.removeListener('SIGINT', interrupt)
    signalSource.removeListener('SIGTERM', terminate)
    clearTimeout(taskTimer)
    await stopWork
  }
}
