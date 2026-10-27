export const DEFAULT_PRESET = 'moon8'

/** Normalize persisted pre-rename activity choices without loading UI frames. */
export function normalizeActivityPreset(name: string | undefined): string | undefined {
  return name === 'claude' ? DEFAULT_PRESET : name
}
