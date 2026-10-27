/** Terminal color formatting for the public Ink style and theme contracts. */
import chalk, { Chalk, type ChalkInstance } from 'chalk'
import type { Color, TextStyles } from './styles.js'

export type ColorType = 'foreground' | 'background'

const namedColors = new Set([
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright',
  'magentaBright', 'cyanBright', 'whiteBright',
])
const hexColor = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i
const rgbColor = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/
const indexedColor = /^ansi256\(\s*(\d{1,3})\s*\)$/

// xterm.js can render truecolor even when its embedding process offers no
// TERM-based color probe. Explicit FORCE_COLOR stays authoritative. In tmux,
// use its broadly supported 256-color path for escape passthrough.
const embeddedXterm = process.env.TERM === 'xterm.js' || process.env.TERM_PROGRAM === 'vscode'
export const CHALK_BOOSTED_FOR_XTERMJS = process.env.FORCE_COLOR === undefined
  && embeddedXterm && chalk.level < 3
const initialLevel = CHALK_BOOSTED_FOR_XTERMJS ? 3 : chalk.level
export const CHALK_CLAMPED_FOR_TMUX = Boolean(process.env.TMUX) && initialLevel > 2
const terminalChalk = CHALK_BOOSTED_FOR_XTERMJS || CHALK_CLAMPED_FOR_TMUX
  ? new Chalk({ level: CHALK_CLAMPED_FOR_TMUX ? 2 : initialLevel })
  : chalk

function selectColor(base: ChalkInstance, color: string | undefined, type: ColorType): ChalkInstance | undefined {
  if (!color) return undefined
  if (color.startsWith('ansi:')) {
    const name = color.slice(5)
    if (!namedColors.has(name)) return undefined
    const property = type === 'background' ? `bg${name[0]!.toUpperCase()}${name.slice(1)}` : name
    const candidate = base[property as keyof ChalkInstance]
    return typeof candidate === 'function' ? candidate as ChalkInstance : undefined
  }
  if (hexColor.test(color)) {
    const opaque = color.length === 9 ? color.slice(0, 7) : color
    return type === 'background' ? base.bgHex(opaque) : base.hex(opaque)
  }
  const rgb = rgbColor.exec(color)
  if (rgb) {
    const channels = rgb.slice(1).map(Number)
    if (channels.some(channel => channel > 255)) return undefined
    const [red, green, blue] = channels as [number, number, number]
    return type === 'background' ? base.bgRgb(red, green, blue) : base.rgb(red, green, blue)
  }
  const indexed = indexedColor.exec(color)
  if (indexed) {
    const value = Number(indexed[1])
    if (value > 255) return undefined
    return type === 'background' ? base.bgAnsi256(value) : base.ansi256(value)
  }
  return undefined
}

export function colorize(str: string, color: string | undefined, type: ColorType): string {
  const style = selectColor(terminalChalk, color, type)
  return style ? style(str) : str
}

export function applyTextStyles(text: string, styles: TextStyles): string {
  let style = terminalChalk
  if (styles.bold) style = style.bold
  if (styles.dim) style = style.dim
  if (styles.italic) style = style.italic
  if (styles.underline) style = style.underline
  if (styles.strikethrough) style = style.strikethrough
  if (styles.inverse) style = style.inverse
  style = selectColor(style, styles.color, 'foreground') ?? style
  style = selectColor(style, styles.backgroundColor, 'background') ?? style
  return style(text)
}

export function applyColor(text: string, color: Color | undefined): string {
  return colorize(text, color, 'foreground')
}

export function backgroundOpenCode(color: Color | undefined): string {
  if (!color) return ''
  // Raster erasure must emit an SGR code even when Chalk disables text color
  // in a non-interactive process. The caller restores the previous style.
  const indexed = indexedColor.exec(color)
  if (indexed) {
    const value = Number(indexed[1])
    return value <= 255 ? `\u001b[48;5;${value}m` : ''
  }
  const rgb = rgbColor.exec(color)
  if (rgb) {
    const channels = rgb.slice(1).map(Number)
    return channels.every(channel => channel <= 255)
      ? `\u001b[48;2;${channels.join(';')}m` : ''
  }
  if (hexColor.test(color)) {
    const hex = color.slice(1, color.length === 9 ? 7 : undefined)
    const full = hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex
    const channels = [0, 2, 4].map(offset => Number.parseInt(full.slice(offset, offset + 2), 16))
    return `\u001b[48;2;${channels.join(';')}m`
  }
  if (color.startsWith('ansi:')) {
    const name = color.slice(5)
    const order = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
    const bright = name.endsWith('Bright')
    const index = order.indexOf(bright ? name.slice(0, -6) : name)
    return index < 0 ? '' : `\u001b[${(bright ? 100 : 40) + index}m`
  }
  return ''
}
