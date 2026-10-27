import type { ProviderModelCapabilities } from '../adapter/ports/channel-settings.js'

/** Level names accepted by the local provider model editor. */
export const PROVIDER_REASONING_LEVELS = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
] as const
export const MODEL_CAPABILITY_FIELDS = [
  'contextWindow', 'maxTokens', 'reasoningEfforts', 'input',
] as const

const capacityError = 'Capacity must be a positive safe integer (K/M supported)'
const reasoningError = 'Use off/minimal/low/medium/high/xhigh/max; no duplicates or off-only list'
const allowedLevels = new Set<string>(PROVIDER_REASONING_LEVELS)

/** Empty inherits the provider default; K and M use decimal units. */
export function parseModelCapacity(text: string): number | undefined {
  const value = text.trim()
  if (!value) return undefined
  const match = /^(\d+(?:\.\d+)?)\s*([kKmM])?$/u.exec(value)
  if (!match) throw new Error(capacityError)
  const unit = match[2]?.toLowerCase()
  const factor = unit === 'm' ? 1_000_000 : unit === 'k' ? 1_000 : 1
  const capacity = Number(match[1]) * factor
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error(capacityError)
  return capacity
}

/** Render the editable wire aliases in their stored order. */
export function formatModelReasoning(value: ProviderModelCapabilities['reasoningEfforts']): string {
  if (value === undefined) return ''
  if (value === false) return 'none'
  return Object.entries(value).map(([level, wire]) =>
    wire === null || (level !== 'off' && wire === level) ? level : `${level}=${wire}`).join(', ')
}

/** Parse the model's offered levels, independent of the current session effort. */
export function parseModelReasoning(text: string): ProviderModelCapabilities['reasoningEfforts'] {
  const value = text.trim()
  if (!value) return undefined
  if (value.toLowerCase() === 'none') return false
  const result: Record<string, string | null> = {}
  for (const raw of value.split(',')) {
    const entry = raw.trim()
    const separator = entry.indexOf('=')
    const level = (separator < 0 ? entry : entry.slice(0, separator)).toLowerCase()
    const wire = separator < 0 ? undefined : entry.slice(separator + 1).trim()
    if (!allowedLevels.has(level) || Object.hasOwn(result, level) ||
        (separator >= 0 && !wire)) throw new Error(reasoningError)
    result[level] = wire ?? (level === 'off' ? null : level)
  }
  if (Object.keys(result).length === 1 && Object.hasOwn(result, 'off')) {
    throw new Error(reasoningError)
  }
  return result
}
