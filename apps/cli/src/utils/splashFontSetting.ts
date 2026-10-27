import type { SplashFontId, SplashFontSetting } from '../adapter/ports/channel-display.js'

export const SPLASH_FONT_DAILY = 'daily' satisfies SplashFontSetting

const FONT_IDS: Readonly<Record<SplashFontId, true>> = {
  bold: true,
  square: true,
  bevel: true,
  wide: true,
  dot: true,
  stencil: true,
  classic: true,
  slab: true,
  shadow: true,
}

export function isSplashFontSetting(value: unknown): value is SplashFontSetting {
  return typeof value === 'string'
    && (value === SPLASH_FONT_DAILY || Object.hasOwn(FONT_IDS, value))
}

export function normalizeSplashFont(value: unknown): SplashFontSetting {
  return isSplashFontSetting(value) ? value : SPLASH_FONT_DAILY
}
