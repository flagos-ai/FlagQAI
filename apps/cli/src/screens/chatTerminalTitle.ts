/** Format the product-owned terminal tab title without changing session text. */
export function chatTerminalTitle(prefix: string, sessionTitle: string): string {
  const title = sessionTitle.trim()
  return `${prefix} FlagQAI${title ? ` · ${title}` : ''}`
}
