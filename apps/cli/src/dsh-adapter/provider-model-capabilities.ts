import type { ProviderModelCapabilities, ProviderModelEditor } from '../adapter/ports/channel-settings.js'
import type { LlmDiscoveredModel } from '../adapter/ports/channel-view.js'
import { t } from '../i18n.js'
import { installedMeetsVersion } from './contract.js'
import { MODEL_CAPABILITY_FIELDS, PROVIDER_REASONING_LEVELS } from '../channel/model-capabilities.js'

export { MODEL_CAPABILITY_FIELDS, PROVIDER_REASONING_LEVELS, formatModelReasoning, parseModelCapacity, parseModelReasoning } from '../channel/model-capabilities.js'

export const CATALOG_MODEL_OVERRIDES_AVAILABLE = installedMeetsVersion('@deepseek-ai/dsh-llm-pi-ai', '0.2.0-rc.1')

function capabilitiesOf(entry: Record<string, unknown>): ProviderModelCapabilities {
  const result: Record<string, unknown> = {}
  for (const field of MODEL_CAPABILITY_FIELDS) {
    if (entry[field] !== undefined) result[field] = entry[field]
  }
  return result as ProviderModelCapabilities
}

function validateCapabilities(values: ProviderModelCapabilities): void {
  for (const field of ['contextWindow', 'maxTokens'] as const) {
    const capacity = values[field]
    if (capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < 1)) {
      throw new Error(t('provider-model-capacity-invalid'))
    }
  }
  const reasoning = values.reasoningEfforts
  if (reasoning !== undefined && reasoning !== false) {
    if (reasoning === null || typeof reasoning !== 'object' || Array.isArray(reasoning)) {
      throw new Error(t('provider-model-reasoning-invalid'))
    }
    const levels = Object.keys(reasoning)
    if (levels.length === 0 || (levels.length === 1 && levels[0] === 'off')) {
      throw new Error(t('provider-model-reasoning-invalid'))
    }
    for (const [level, wire] of Object.entries(reasoning)) {
      if (!PROVIDER_REASONING_LEVELS.includes(level as typeof PROVIDER_REASONING_LEVELS[number]) ||
          (level === 'off' ? wire !== null && (typeof wire !== 'string' || wire.trim() === '')
            : typeof wire !== 'string' || wire.trim() === '')) {
        throw new Error(t('provider-model-reasoning-invalid'))
      }
    }
  }
  const input = values.input
  if (input !== undefined && (!Array.isArray(input) || input.length === 0 ||
      input[0] !== 'text' || input.length > 2 ||
      (input.length === 2 && input[1] !== 'image'))) {
    throw new Error(t('provider-model-input-invalid'))
  }
}

function sameCapabilities(a: ProviderModelCapabilities, b: ProviderModelCapabilities): boolean {
  return MODEL_CAPABILITY_FIELDS.every(field => JSON.stringify(a[field]) === JSON.stringify(b[field]))
}

export function createProviderModelEditor(
  entryFor: (id: string) => Record<string, unknown>,
  discoveredById: ReadonlyMap<string, LlmDiscoveredModel>,
): { editor: ProviderModelEditor; entries: ReadonlyMap<string, Record<string, unknown>> } {
  const entries = new Map<string, Record<string, unknown>>()
  const editor: ProviderModelEditor = {
    reasoningEditable: installedMeetsVersion('@deepseek-ai/dsh-llm-pi-ai', '0.2.0-rc.1'),
    read(id) {
      const discovered = discoveredById.get(id)
      return {
        values: capabilitiesOf(entries.get(id) ?? entryFor(id)),
        defaults: discovered === undefined ? {} : {
          ...(discovered.contextWindow !== undefined ? { contextWindow: discovered.contextWindow } : {}),
          ...(discovered.maxTokens !== undefined ? { maxTokens: discovered.maxTokens } : {}),
          ...(discovered.inputModalities !== undefined
            ? { input: discovered.inputModalities.filter((mode): mode is 'text' | 'image' =>
              mode === 'text' || mode === 'image') } : {}),
        },
      }
    },
    save(id, values) {
      validateCapabilities(values)
      const original = entryFor(id)
      if (sameCapabilities(values, capabilitiesOf(original))) {
        entries.delete(id)
        return
      }
      const next = { ...original }
      for (const field of MODEL_CAPABILITY_FIELDS) {
        const value = values[field]
        if (value === undefined) delete next[field]
        else if (field === 'reasoningEfforts' && values.reasoningEfforts !== false) {
          next[field] = { ...values.reasoningEfforts }
        } else if (field === 'input' && values.input !== undefined) {
          next[field] = [...values.input]
        } else next[field] = value
      }
      entries.set(id, next)
    },
    edited(id) { return entries.has(id) },
  }
  return { editor, entries }
}
