const value = (args, index, name) => {
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

/** Parse the deliberately small, stable `flagqai serve` surface. */
export function parseServeArgs(args) {
  let host = '127.0.0.1'
  let port = 4096
  for (let index = 0; index < args.length;) {
    const hostValue = value(args, index, '--host')
    if (hostValue !== undefined) {
      host = hostValue.value
      index += hostValue.consumed
      continue
    }
    const portValue = value(args, index, '--port')
    if (portValue !== undefined) {
      port = Number(portValue.value)
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error('--port must be an integer from 0 through 65535')
      }
      index += portValue.consumed
      continue
    }
    throw new Error(`unknown flagqai serve option: ${args[index]}`)
  }
  return { host, port }
}
