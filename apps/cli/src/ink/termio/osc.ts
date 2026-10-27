import { Buffer } from 'node:buffer'
import { env } from '../../utils/env.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import type { Action, Color, TabStatusAction } from './types.js'

const ESC = '\x1b'
const BEL = '\x07'
export const OSC_PREFIX = `${ESC}]`
export const ST = `${ESC}\\`
const unsafePayload = /[\x00-\x1f\x7f-\x9f]/g
const terminator = (): string => env.terminal === 'kitty' ? ST : BEL

/** Form an OSC command without allowing a payload to terminate the command. */
export function osc(...parts: (string | number)[]): string {
  return `${OSC_PREFIX}${parts.map(part => String(part).replace(unsafePayload, '')).join(';')}${terminator()}`
}

/** DCS passthrough for multiplexers which otherwise intercept OSC commands. */
export function wrapForMultiplexer(sequence: string): string {
  if (process.env.TMUX) return `${ESC}Ptmux;${sequence.replaceAll(ESC, ESC + ESC)}${ST}`
  if (process.env.STY) return `${ESC}P${sequence}${ST}`
  return sequence
}

export type ClipboardPath = 'native' | 'tmux-buffer' | 'osc52'

/** Use macOS pasteboard locally and terminal transport elsewhere. */
export function getClipboardPath(): ClipboardPath {
  if (process.platform === 'darwin') return 'native'
  if (process.env.TMUX) return 'tmux-buffer'
  return 'osc52'
}

export async function tmuxLoadBuffer(text: string): Promise<boolean> {
  if (!process.env.TMUX) return false
  const result = await execFileNoThrow('tmux', ['load-buffer', '-w', '-'], { input: text, timeout: 2000 })
  return result.code === 0
}

/** Copy through the local path and return OSC 52 for the outer terminal. */
export async function setClipboard(text: string): Promise<string> {
  const path = getClipboardPath()
  if (path === 'tmux-buffer') await tmuxLoadBuffer(text)
  if (path === 'native') {
    await execFileNoThrow('pbcopy', [], { input: text, timeout: 2000 })
  }
  const sequence = osc(OSC.CLIPBOARD, 'c', Buffer.from(text, 'utf8').toString('base64'))
  return path === 'native' ? sequence : wrapForMultiplexer(sequence)
}

/** Exposed for callers that change clipboard-related environment settings. */
export function _resetLinuxCopyCache(): void {}

export const OSC = {
  SET_TITLE_AND_ICON: 0, SET_ICON: 1, SET_TITLE: 2, SET_COLOR: 4,
  SET_CWD: 7, HYPERLINK: 8, ITERM2: 9, SET_FG_COLOR: 10,
  SET_BG_COLOR: 11, SET_CURSOR_COLOR: 12, CLIPBOARD: 52, KITTY: 99,
  RESET_COLOR: 104, RESET_FG_COLOR: 110, RESET_BG_COLOR: 111,
  RESET_CURSOR_COLOR: 112, SEMANTIC_PROMPT: 133, GHOSTTY: 777,
  TAB_STATUS: 21337,
} as const

function splitEscaped(value: string): string[] {
  const fields: string[] = []
  let field = ''
  let escaped = false
  for (const ch of value) {
    if (escaped) {
      field += ch
      escaped = false
    } else if (ch === '\\') escaped = true
    else if (ch === ';') { fields.push(field); field = '' }
    else field += ch
  }
  if (escaped) field += '\\'
  fields.push(field)
  return fields
}

/** Parse OSC commands consumed by the local terminal model. */
export function parseOSC(content: string): Action | null {
  const separator = content.indexOf(';')
  if (separator < 0) return { type: 'unknown', sequence: OSC_PREFIX + content }
  const code = content.slice(0, separator)
  const body = content.slice(separator + 1)
  if (code === '0') return { type: 'title', action: { type: 'both', title: body } }
  if (code === '1') return { type: 'title', action: { type: 'iconName', name: body } }
  if (code === '2') return { type: 'title', action: { type: 'windowTitle', title: body } }
  if (code === '8') {
    const boundary = body.indexOf(';')
    if (boundary < 0) return { type: 'link', action: { type: 'end' } }
    const url = body.slice(boundary + 1)
    if (!url) return { type: 'link', action: { type: 'end' } }
    const params = Object.fromEntries(body.slice(0, boundary).split(':')
      .filter(field => field.includes('='))
      .map(field => [field.slice(0, field.indexOf('=')), field.slice(field.indexOf('=') + 1)]))
    return { type: 'link', action: Object.keys(params).length
      ? { type: 'start', url, params } : { type: 'start', url } }
  }
  if (code === String(OSC.TAB_STATUS)) {
    const action: TabStatusAction = {}
    for (const field of splitEscaped(body)) {
      const eq = field.indexOf('=')
      if (eq < 0) continue
      const key = field.slice(0, eq)
      const value = field.slice(eq + 1)
      if (key === 'status') action.status = value || null
      if (key === 'indicator') action.indicator = value ? parseOscColor(value) : null
      if (key === 'status-color') action.statusColor = value ? parseOscColor(value) : null
    }
    return { type: 'tabStatus', action }
  }
  return { type: 'unknown', sequence: OSC_PREFIX + content }
}

/** Normalize OSC color replies to eight-bit RGB channels. */
export function parseOscColor(spec: string): Color | null {
  if (/^#[\da-f]{6}$/i.test(spec)) return {
    type: 'rgb', r: parseInt(spec.slice(1, 3), 16),
    g: parseInt(spec.slice(3, 5), 16), b: parseInt(spec.slice(5, 7), 16),
  }
  const channels = /^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/i.exec(spec)
  if (!channels) return null
  const byte = (hex: string): number => parseInt(hex.length === 1 ? hex + hex : hex.slice(0, 2), 16)
  return { type: 'rgb', r: byte(channels[1]!), g: byte(channels[2]!), b: byte(channels[3]!) }
}

function safeLinkId(url: string): string {
  let hash = 2166136261
  for (const ch of url) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}

/** Start an OSC 8 hyperlink, encoding spaces and neutralizing control bytes. */
export function link(url: string, params?: Record<string, string>): string {
  const safeUrl = url.replaceAll(' ', '%20')
  const entries = Object.entries(params ?? { id: safeLinkId(safeUrl) })
  const metadata = entries.map(([key, value]) => `${key}=${value}`).join(':')
  return osc(OSC.HYPERLINK, metadata, safeUrl)
}

export const LINK_END = osc(OSC.HYPERLINK, '', '')
export const ITERM2 = { NOTIFY: 0, BADGE: 2, PROGRESS: 4 } as const
export const PROGRESS = { CLEAR: 0, SET: 1, ERROR: 2, INDETERMINATE: 3 } as const
export const CLEAR_ITERM2_PROGRESS = `${OSC_PREFIX}9;4;0;${BEL}`
export const CLEAR_TERMINAL_TITLE = osc(OSC.SET_TITLE_AND_ICON, '')
export const CLEAR_TAB_STATUS = osc(OSC.TAB_STATUS, 'indicator=', 'status=', 'status-color=')

export function supportsTabStatus(): boolean {
  return process.env.FLAGQAI_TAB_STATUS === '1'
}

function tabColor(color: Color | null): string {
  if (!color || color.type !== 'rgb') return ''
  const hex = (channel: number): string => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`
}

/** Set only the supplied tab fields; a null value explicitly clears one. */
export function tabStatus(fields: TabStatusAction): string {
  const pieces: string[] = []
  if ('indicator' in fields) pieces.push(`indicator=${tabColor(fields.indicator ?? null)}`)
  if ('status' in fields) pieces.push(`status=${(fields.status ?? '').replaceAll('\\', '\\\\').replaceAll(';', '\\;')}`)
  if ('statusColor' in fields) pieces.push(`status-color=${tabColor(fields.statusColor ?? null)}`)
  return osc(OSC.TAB_STATUS, ...(pieces.length ? pieces : ['']))
}
