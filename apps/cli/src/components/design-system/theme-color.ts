import type { Color } from '../../ink/styles.js'
import type { Theme } from '../../theme.js'

/** Resolve semantic palette names while leaving terminal color literals intact. */
export function themeColor(value: keyof Theme | Color | undefined, palette: Theme): Color | undefined {
  if (value === undefined) return undefined
  return Object.prototype.hasOwnProperty.call(palette, value)
    ? palette[value as keyof Theme] as Color
    : value as Color
}
