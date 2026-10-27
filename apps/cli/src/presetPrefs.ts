import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './utils/paths.js'

const preferenceFile = 'agent-preset.json'

/** The saved choice is an opaque roster ID, not an alias to normalize here. */
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
}

export function parsePresetPref(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const id = (value as Record<string, unknown>).preset
    return validId(id) ? id : undefined
  } catch {
    return undefined
  }
}

export function readPresetPref(dir: string = DATA_DIR): string | undefined {
  try {
    return parsePresetPref(readFileSync(join(dir, preferenceFile), 'utf8'))
  } catch {
    return undefined
  }
}

/** Save a new choice atomically so a failed write cannot truncate the old one. */
export function writePresetPref(id: string, dir: string = DATA_DIR): boolean {
  if (!validId(id)) return false
  let temporary: string | undefined
  let descriptor: number | undefined
  try {
    mkdirSync(dir, { recursive: true })
    temporary = join(dir, `.agent-preset-${randomUUID()}.tmp`)
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify({ preset: id })}\n`, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, join(dir, preferenceFile))
    return true
  } catch {
    return false
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor) } catch { /* The write already failed. */ }
    }
    if (temporary !== undefined) {
      try { unlinkSync(temporary) } catch { /* Renamed or already removed. */ }
    }
  }
}

/** Rewrite a legacy alias only when it still owns the saved preference. */
export function migratePresetPref(previous: string | undefined, resolved: string | undefined,
  dir: string = DATA_DIR): boolean {
  if (previous === undefined || previous === resolved) return true
  if (!validId(resolved)) return false
  if (readPresetPref(dir) !== previous) return true
  return writePresetPref(resolved, dir)
}
