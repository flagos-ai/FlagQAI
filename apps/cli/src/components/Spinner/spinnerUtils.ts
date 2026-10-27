/** Shared color and frame primitives for terminal animation. */
export type RGBColor = { r: number; g: number; b: number }

const frames = ['·', '•', '●', '•'] as const

/** Callers may freely edit their returned frame list. */
export function getDefaultCharacters(): string[] {
  return [...frames]
}

/** Linear RGB interpolation; callers choose the blend factor. */
export function interpolateColor(from: RGBColor, to: RGBColor, t: number): RGBColor {
  return {
    r: Math.round(from.r + (to.r - from.r) * t),
    g: Math.round(from.g + (to.g - from.g) * t),
    b: Math.round(from.b + (to.b - from.b) * t),
  }
}

export function toRGBColor({ r, g, b }: RGBColor): `rgb(${number},${number},${number})` {
  return `rgb(${r},${g},${b})`
}

/** Standard HSL conversion at fixed saturation 0.7 and lightness 0.6. */
export function hueToRgb(hue: number): RGBColor {
  const angle = ((hue % 360) + 360) % 360
  const chroma = (1 - Math.abs(2 * 0.6 - 1)) * 0.7
  const secondary = chroma * (1 - Math.abs((angle / 60) % 2 - 1))
  const offset = 0.6 - chroma / 2
  const sectors: readonly (readonly [number, number, number])[] = [
    [chroma, secondary, 0], [secondary, chroma, 0],
    [0, chroma, secondary], [0, secondary, chroma],
    [secondary, 0, chroma], [chroma, 0, secondary],
  ]
  const sector = sectors[Math.floor(angle / 60)]
  if (sector === undefined) return { r: Number.NaN, g: Number.NaN, b: Number.NaN }
  return {
    r: Math.round((sector[0] + offset) * 255),
    g: Math.round((sector[1] + offset) * 255),
    b: Math.round((sector[2] + offset) * 255),
  }
}

const rgbPattern = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/u
const parsedColors = new Map<string, RGBColor | null>()

/** Parse the integer rgb(...) form used by terminal theme palettes. */
export function parseRGB(value: string): RGBColor | null {
  if (parsedColors.has(value)) return parsedColors.get(value) ?? null
  const match = rgbPattern.exec(value)
  const color = match === null ? null : {
    r: Number(match[1]), g: Number(match[2]), b: Number(match[3]),
  }
  parsedColors.set(value, color)
  return color
}
