const readValue = (args, index, name) => {
  const item = args[index]
  if (item === name) {
    const next = args[index + 1]
    if (next === undefined || next.startsWith('-')) throw new Error(`${name} requires a value`)
    return { value: next, consumed: 2 }
  }
  if (item.startsWith(`${name}=`)) {
    const inline = item.slice(name.length + 1)
    if (inline === '') throw new Error(`${name} requires a value`)
    return { value: inline, consumed: 1 }
  }
  return undefined
}

const requireSafeEndpoint = value => {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('attach URL must be an absolute HTTP or HTTPS URL')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('attach URL must use HTTP or HTTPS')
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('attach URL must not contain credentials')
  }
  const loopback = ['127.0.0.1', '[::1]', '::1', 'localhost'].includes(url.hostname)
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error('remote FlagQAI services require HTTPS')
  }
  return url.href.replace(/\/$/, '')
}

/** Parse the bounded `flagqai attach` command surface. */
export function parseAttachArgs(args, cwd = process.cwd()) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { help: true }
  }
  if (args[0].startsWith('-')) throw new Error('flagqai attach requires a server URL')
  const baseUrl = requireSafeEndpoint(args[0])
  let backendId = 'dsh'
  let workspace = cwd
  let sessionId
  let resourceId
  let json = false
  let prompt
  let timeoutSeconds

  for (let index = 1; index < args.length;) {
    const item = args[index]
    if (item === '--') {
      prompt = args.slice(index + 1).join(' ').trim() || undefined
      index = args.length
      continue
    }
    if (item === '--json') {
      json = true
      index += 1
      continue
    }
    if (item === '--help' || item === '-h') return { help: true }
    let parsed
    if ((parsed = readValue(args, index, '--backend')) !== undefined) backendId = parsed.value
    else if ((parsed = readValue(args, index, '--cwd')) !== undefined) workspace = parsed.value
    else if ((parsed = readValue(args, index, '--session')) !== undefined) sessionId = parsed.value
    else if ((parsed = readValue(args, index, '--resource')) !== undefined) resourceId = parsed.value
    else if ((parsed = readValue(args, index, '--prompt')) !== undefined) prompt = parsed.value
    else if ((parsed = readValue(args, index, '--timeout')) !== undefined) {
      timeoutSeconds = Number(parsed.value)
      if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 2147483) throw new Error('--timeout must be an integer from 1 through 2147483 seconds')
    }
    else throw new Error(`unknown flagqai attach option: ${item}`)
    index += parsed.consumed
  }
  if (sessionId !== undefined && resourceId !== undefined) {
    throw new Error('--session and --resource cannot be used together')
  }
  if (timeoutSeconds !== undefined && prompt === undefined) throw new Error('--timeout requires a one-shot prompt')
  return { help: false, baseUrl, backendId, cwd: workspace, sessionId, resourceId, json, prompt,
    ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }) }
}

export const ATTACH_HELP = `Usage: flagqai attach <url> [options] [-- <prompt>]

Connect to a running FlagQAI service without starting the local TUI.

Options:
  --backend <id>       Backend for a new session (default: dsh)
  --cwd <path>         Remote session workspace (default: current directory)
  --session <id>       Resume a backend session in a new API resource
  --resource <id>      Reattach to an existing live API resource
  --prompt <text>      Submit one prompt and exit after the turn
  --timeout <seconds>  One-shot deadline; detach on expiry without cancelling
  --json               Print AgentEvent records as JSON Lines
  -h, --help           Show this help

Interactive commands: /cancel, /status, /model, /model <number>, /plan [on|off],
  /mode [number], /effort [number|auto], /image [local path|clear|remove <number>],
  /dispose, /exit
Ctrl+C requests cancellation during a task; SIGTERM and /exit only detach.
Plain HTTP is accepted only for loopback services; remote services require HTTPS.`
