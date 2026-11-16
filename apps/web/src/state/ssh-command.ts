/** Parse connection fields only; never execute pasted text as a shell command. */
export function parseSSHCommand(input: string, defaultPort = 22) {
  const tokens: string[] = [];
  let token = "",
    quote = "",
    active = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "\\" && quote !== "'") {
      if (++i === input.length)
        throw new Error("Incomplete SSH command escape.");
      token += input[i];
      active = true;
    } else if (quote) {
      if (c === quote) quote = "";
      else token += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      active = true;
    } else if (/\s/.test(c)) {
      if (active) tokens.push(token);
      token = "";
      active = false;
    } else {
      token += c;
      active = true;
    }
  }
  if (quote) throw new Error("Close the quote in the SSH command.");
  if (active) tokens.push(token);
  const command = tokens[0] === "ssh";
  if (command) tokens.shift();
  let port = command ? 22 : defaultPort,
    user = "",
    identity = "",
    target = "",
    flags = "";
  while (tokens.length) {
    const part = tokens.shift()!;
    if (command && !target && part === "--") {
      target = tokens.shift() || "";
      break;
    }
    if (command && !target && /^-[pli]/.test(part)) {
      const option = part[1],
        value = part.slice(2) || tokens.shift();
      if (!value || value.startsWith("-"))
        throw new Error(`SSH -${option} needs a value.`);
      if (option === "p") {
        if (!/^\d+$/.test(value))
          throw new Error("SSH port must be between 1 and 65535.");
        port = Number(value);
      } else if (option === "l") user = value;
      else identity = value;
    } else if (command && !target && /^-[CAXYTax]+$/.test(part))
      flags += part.slice(1);
    else if (part.startsWith("-"))
      throw new Error(
        `Unsupported SSH option: ${part}. Use an SSH config alias for other connection settings.`,
      );
    else if (!target) target = part;
    else
      throw new Error(
        "Paste only the SSH connection command, without a remote command or shell operators.",
      );
  }
  if (tokens.length) throw new Error("Remote commands are not supported here.");
  if (!target) throw new Error("Specify an SSH host.");
  if (user) {
    if (target.includes("@"))
      throw new Error("Specify the SSH user only once.");
    target = `${user}@${target}`;
  }
  if (
    !/^[A-Za-z0-9_][A-Za-z0-9_.:-]*(?:@[A-Za-z0-9_][A-Za-z0-9_.:-]*)?$/.test(
      target,
    ) ||
    target.length > 253
  )
    throw new Error("Enter an SSH command, host alias or user@host.");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SSH port must be between 1 and 65535.");
  if (
    identity &&
    (identity.startsWith("-") || /[\x00-\x1f\x7f]/.test(identity))
  )
    throw new Error("Use a local identity file path.");
  return {
    target,
    port,
    identity,
    command,
    notice: flags
      ? "Interactive flags are omitted for background tasks; agent and X11 forwarding stay disabled."
      : "",
  };
}
