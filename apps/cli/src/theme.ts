/**
 * FlagQAI terminal theme registry.
 *
 * The public token shape and historical input aliases remain compatible with
 * saved user themes. Built-in palettes and resolver behavior are independently
 * defined here from semantic roles and product-facing compatibility checks.
 */
export type Theme = {
  autoAccept: string
  bashBorder: string
  /** Primary brand/focus color. */
  accent: string
  toolNameMutate: string
  toolNameExec: string
  /** Primary brand/focus shimmer color. */
  accentShimmer: string
  /** Working activity indicator color. */
  activity: string
  /** Working activity indicator shimmer color. */
  activityShimmer: string
  permission: string
  permissionShimmer: string
  planMode: string
  ide: string
  promptBorder: string
  promptBorderShimmer: string
  text: string
  inverseText: string
  inactive: string
  inactiveShimmer: string
  subtle: string
  suggestion: string
  remember: string
  background: string
  // Semantic colors
  success: string
  error: string
  warning: string
  merged: string
  warningShimmer: string
  // Diff colors
  diffAdded: string
  diffRemoved: string
  diffAddedDimmed: string
  diffRemovedDimmed: string
  diffAddedWord: string
  diffRemovedWord: string
  // Tool card surfaces (two depth levels; the card itself takes the dim
  // shade, diff context rows the lighter one, changed rows the diff palette)
  toolCardBackground: string
  toolCardBackgroundDim: string
  // Tool status dots, by tool category (error always wins with a red ✗)
  toolDotExec: string
  toolDotRead: string
  toolDotWrite: string
  toolDotWeb: string
  toolDotTask: string
  // Diff syntax highlighting (user themes may override any of these)
  syntaxKeyword: string
  syntaxString: string
  syntaxComment: string
  syntaxNumber: string
  syntaxFunction: string
  syntaxType: string
  syntaxVariable: string
  syntaxOperator: string
  syntaxPunctuation: string
  syntaxConstant: string
  // Agent colors
  // Grove colors
  professionalBlue: string
  // Chrome colors
  chromeYellow: string
  // Themed chrome that used to be hardcoded: the context bar's per-content-type
  // segment fills (system → tools, in bar order), the thinking-effort ignition
  // pair (top-tier sweep / `❯` prefix / tier badge), and the prompt caret.
  // `cursor` empty keeps the inverse-video caret.
  contextBarSystem: string
  contextBarPrompt: string
  contextBarAssistant: string
  contextBarThinking: string
  contextBarTools: string
  /** Effort ignition colour: the wave crest, the charged `❯` and the badge. */
  ignition: string
  /** Where the ignition wave fades out (its resting end), i.e. the band colour. */
  ignitionDim: string
  /**
   * Prompt-input caret fill. Empty (every built-in) keeps the inverse-video
   * caret; a declared fill gets the palette ink that contrasts with it.
   */
  cursor: string
  // TUI V2 colors
  /** Mascot body color. */
  mascotBody: string
  /** Input/editor background color. */
  inputBackground: string
  userMessageBackground: string
  userMessageBackgroundHover: string
  messageActionsBackground: string
  selectionBg: string
  bashMessageBackgroundColor: string
  memoryBackgroundColor: string
  rate_limit_fill: string
  rate_limit_empty: string
  fastMode: string
  fastModeShimmer: string
  userPromptLabel: string
  // Subagent message colors
  subagentBullet: string
  subagentDescription: string
  subagentModel: string
  subagentElapsed: string
  subagentToolName: string
  subagentStatusRunning: string
  subagentStatusCompleted: string
  subagentStatusFailed: string
}


export type DeprecatedThemeKey =
  | 'claude' | 'claudeShimmer'
  | 'claudeBlue_FOR_SYSTEM_SPINNER' | 'claudeBlueShimmer_FOR_SYSTEM_SPINNER'
  | 'clawd_body' | 'clawd_background' | 'briefLabelYou'

const retired = [
  'briefLabelClaude',
  'red_FOR_SUBAGENTS_ONLY', 'blue_FOR_SUBAGENTS_ONLY', 'green_FOR_SUBAGENTS_ONLY',
  'yellow_FOR_SUBAGENTS_ONLY', 'purple_FOR_SUBAGENTS_ONLY', 'orange_FOR_SUBAGENTS_ONLY',
  'pink_FOR_SUBAGENTS_ONLY', 'cyan_FOR_SUBAGENTS_ONLY',
  'rainbow_red', 'rainbow_red_shimmer', 'rainbow_orange', 'rainbow_orange_shimmer',
  'rainbow_yellow', 'rainbow_yellow_shimmer', 'rainbow_green', 'rainbow_green_shimmer',
  'rainbow_blue', 'rainbow_blue_shimmer', 'rainbow_indigo', 'rainbow_indigo_shimmer',
  'rainbow_violet', 'rainbow_violet_shimmer',
] as const
export type RetiredThemeKey = (typeof retired)[number]
export type ThemeColorKey = keyof Theme | DeprecatedThemeKey | RetiredThemeKey
const retiredSet = new Set<string>(retired)
export function isRetiredThemeKey(value: string): value is RetiredThemeKey { return retiredSet.has(value) }

export const DEPRECATED_THEME_KEY_ALIASES: Readonly<Record<DeprecatedThemeKey, keyof Theme>> = Object.freeze({
  claude: 'accent',
  claudeShimmer: 'accentShimmer',
  claudeBlue_FOR_SYSTEM_SPINNER: 'activity',
  claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'activityShimmer',
  clawd_body: 'mascotBody',
  clawd_background: 'inputBackground',
  briefLabelYou: 'userPromptLabel',
})

export const THEME_NAMES = ['dark', 'dark-ansi', 'light', 'claude-dark', 'claude-paper', 'codex-lavender', 'codex-paper'] as const
export const AUTO_THEME_NAME = 'auto'
export type ThemeName = string
export type ThemeResolver = (name: string) => Theme | undefined
export function isBuiltInThemeName(name: string): boolean {
  return (THEME_NAMES as readonly string[]).includes(name)
}

/** A small semantic vocabulary makes every token intentional and complete. */
type Seed = {
  accent: string; highlight: string; text: string; inverse: string; muted: string
  faint: string; surface: string; panel: string; panelDim: string
  success: string; error: string; warning: string; blue: string; violet: string
  green: string; red: string; yellow: string; comment: string
}
function palette(s: Seed): Theme {
  return {
    autoAccept: s.success, bashBorder: s.muted,
    accent: s.accent, toolNameMutate: s.yellow, toolNameExec: s.blue,
    accentShimmer: s.highlight, activity: s.blue, activityShimmer: s.highlight,
    permission: s.warning, permissionShimmer: s.yellow, planMode: s.violet,
    ide: s.blue, promptBorder: s.accent, promptBorderShimmer: s.highlight,
    text: s.text, inverseText: s.inverse, inactive: s.muted,
    inactiveShimmer: s.highlight, subtle: s.faint, suggestion: s.muted,
    remember: s.violet, background: s.surface,
    success: s.success, error: s.error, warning: s.warning, merged: s.violet,
    warningShimmer: s.yellow,
    diffAdded: s.green, diffRemoved: s.red,
    diffAddedDimmed: s.panelDim, diffRemovedDimmed: s.panelDim,
    diffAddedWord: s.green, diffRemovedWord: s.red,
    toolCardBackground: s.panel, toolCardBackgroundDim: s.panelDim,
    toolDotExec: s.blue, toolDotRead: s.violet, toolDotWrite: s.yellow,
    toolDotWeb: s.accent, toolDotTask: s.green,
    syntaxKeyword: s.violet, syntaxString: s.green, syntaxComment: s.comment,
    syntaxNumber: s.yellow, syntaxFunction: s.blue, syntaxType: s.highlight,
    syntaxVariable: s.text, syntaxOperator: s.muted,
    syntaxPunctuation: s.muted, syntaxConstant: s.yellow,
    professionalBlue: s.blue, chromeYellow: s.yellow,
    contextBarSystem: 'rgb(34,48,95)', contextBarPrompt: 'rgb(43,61,120)',
    contextBarAssistant: 'rgb(52,74,146)', contextBarThinking: 'rgb(77,107,254)',
    contextBarTools: 'rgb(90,124,255)',
    ignition: 'rgb(130,185,255)', ignitionDim: s.panelDim, cursor: '',
    mascotBody: s.accent, inputBackground: s.panel,
    userMessageBackground: '', userMessageBackgroundHover: s.panel,
    messageActionsBackground: s.panel, selectionBg: s.panelDim,
    bashMessageBackgroundColor: s.panel, memoryBackgroundColor: s.panel,
    rate_limit_fill: s.accent, rate_limit_empty: s.panelDim,
    fastMode: s.yellow, fastModeShimmer: s.highlight,
    userPromptLabel: s.yellow,
    subagentBullet: s.accent, subagentDescription: s.muted,
    subagentModel: s.blue, subagentElapsed: s.faint,
    subagentToolName: s.accent, subagentStatusRunning: s.warning,
    subagentStatusCompleted: s.success, subagentStatusFailed: s.error,
  }
}

const midnight: Seed = {
  accent: 'rgb(125,161,222)', highlight: 'rgb(159,188,237)',
  text: 'rgb(229,234,244)', inverse: 'rgb(20,25,36)',
  muted: 'rgb(149,159,179)', faint: 'rgb(112,123,146)',
  surface: 'rgb(25,31,44)', panel: 'rgb(36,43,58)', panelDim: 'rgb(45,54,72)',
  success: 'rgb(130,184,157)', error: 'rgb(229,116,124)',
  warning: 'rgb(235,192,110)', blue: 'rgb(120,172,239)',
  violet: 'rgb(180,160,232)', green: 'rgb(130,184,157)',
  red: 'rgb(229,116,124)', yellow: 'rgb(235,192,110)',
  comment: 'rgb(112,123,146)',
}
const paper: Seed = {
  ...midnight, accent: 'rgb(63,108,196)', highlight: 'rgb(90,131,208)',
  text: 'rgb(35,43,57)', inverse: 'rgb(255,255,255)',
  muted: 'rgb(103,114,135)', faint: 'rgb(130,139,153)',
  surface: 'rgb(245,247,251)', panel: 'rgb(255,255,255)',
  panelDim: 'rgb(255,255,255)', success: 'rgb(65,135,99)',
  error: 'rgb(190,68,75)', warning: 'rgb(167,114,40)',
  comment: 'rgb(115,124,139)',
}
const clay: Seed = {
  ...midnight, accent: 'rgb(215,119,87)', highlight: 'rgb(236,155,125)',
  text: 'rgb(244,241,234)', muted: 'rgb(184,178,168)',
  surface: 'rgb(27,26,24)', panel: 'rgb(36,34,31)', panelDim: 'rgb(47,43,39)',
  success: 'rgb(129,150,106)', error: 'rgb(217,107,95)',
  comment: 'rgb(129,124,116)',
}
const clayPaper: Seed = {
  ...paper, accent: 'rgb(201,100,66)', highlight: 'rgb(221,132,97)',
  text: 'rgb(37,35,31)', surface: 'rgb(252,249,243)',
  panel: 'rgb(255,253,248)', panelDim: 'rgb(247,242,233)',
  success: 'rgb(104,125,81)', error: 'rgb(187,81,72)',
  comment: 'rgb(150,144,135)',
}
const lavender: Seed = {
  ...midnight, accent: 'rgb(166,155,232)', highlight: 'rgb(189,181,248)',
  text: 'rgb(244,244,247)', muted: 'rgb(184,184,196)',
  surface: 'rgb(22,22,29)', panel: 'rgb(32,32,40)', panelDim: 'rgb(40,37,67)',
  success: 'rgb(127,179,138)', error: 'rgb(217,114,124)',
  comment: 'rgb(125,125,138)',
}
const lavenderPaper: Seed = {
  ...paper, accent: 'rgb(138,126,217)', highlight: 'rgb(166,155,232)',
  text: 'rgb(23,23,28)', surface: 'rgb(248,248,252)',
  panel: 'rgb(255,255,255)', panelDim: 'rgb(236,233,251)',
  success: 'rgb(95,139,105)', error: 'rgb(196,90,102)',
  comment: 'rgb(141,141,152)',
}

const builtIn: Readonly<Record<(typeof THEME_NAMES)[number], Theme>> = {
  dark: palette(midnight),
  light: { ...palette(paper), ignition: 'rgb(30,95,235)' },
  'dark-ansi': palette({
    ...midnight, accent: 'ansi:blueBright', highlight: 'ansi:cyanBright',
    text: 'ansi:white', inverse: 'ansi:black', muted: 'ansi:whiteBright',
    faint: 'ansi:blackBright', surface: 'ansi:black', panel: 'ansi:blackBright',
    panelDim: 'ansi:blackBright', success: 'ansi:greenBright', error: 'ansi:redBright',
    warning: 'ansi:yellowBright', blue: 'ansi:blueBright', violet: 'ansi:magentaBright',
    green: 'ansi:greenBright', red: 'ansi:redBright', yellow: 'ansi:yellowBright',
    comment: 'ansi:whiteBright',
  }),
  'claude-dark': { ...palette(clay), inputBackground: '', syntaxOperator: clay.muted, ide: clay.accent },
  'claude-paper': { ...palette(clayPaper), inputBackground: '', ignition: 'rgb(30,95,235)' },
  'codex-lavender': {
    ...palette(lavender), inputBackground: '', promptBorder: 'rgb(117,105,199)',
    toolDotWeb: 'rgb(143,155,255)', ide: lavender.accent,
  },
  'codex-paper': { ...palette(lavenderPaper), inputBackground: '', ignition: 'rgb(30,95,235)' },
}

const themeKeys = new Set<keyof Theme>(Object.keys(builtIn.dark) as (keyof Theme)[])
export function normalizeThemeKey(value: string): keyof Theme | undefined {
  if (Object.hasOwn(DEPRECATED_THEME_KEY_ALIASES, value))
    return DEPRECATED_THEME_KEY_ALIASES[value as DeprecatedThemeKey]
  return themeKeys.has(value as keyof Theme) ? value as keyof Theme : undefined
}
export function isThemeColorKey(value: unknown): value is ThemeColorKey {
  return typeof value === 'string' && normalizeThemeKey(value) !== undefined
}

let autoBase: 'light' | 'dark' = 'dark'
export function setAutoThemeBase(name: 'light' | 'dark'): void { autoBase = name }
export function getAutoThemeBase(): 'light' | 'dark' { return autoBase }

// Saved legacy objects are normalized once per snapshot. Mutating a caller's
// object invalidates the snapshot without allocating on every render.
const normalized = new WeakMap<object, { fingerprint: string; value: Theme }>()
export function normalizeThemePalette(value: unknown): Theme | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  const keys = Object.keys(source)
  if (!keys.some(key => Object.hasOwn(DEPRECATED_THEME_KEY_ALIASES, key) || retiredSet.has(key)))
    return value as Theme
  const fingerprint = JSON.stringify(source)
  const cached = normalized.get(value)
  if (cached?.fingerprint === fingerprint) return cached.value
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (retiredSet.has(key) || Object.hasOwn(DEPRECATED_THEME_KEY_ALIASES, key)) continue
    result[key] = source[key]
  }
  for (const [legacy, semantic] of Object.entries(DEPRECATED_THEME_KEY_ALIASES)) {
    if (!(semantic in result) && legacy in source) result[semantic] = source[legacy]
  }
  const palette = result as Theme
  normalized.set(value, { fingerprint, value: palette })
  return palette
}

let customResolver: ThemeResolver | undefined
const runtimeResolvers: { token: symbol; resolver: ThemeResolver }[] = []
export function registerCustomThemeResolver(resolver: ThemeResolver): void { customResolver = resolver }
export function registerRuntimeThemeResolver(resolver: ThemeResolver): () => void {
  const token = Symbol('runtime theme')
  runtimeResolvers.push({ token, resolver })
  return () => {
    const at = runtimeResolvers.findIndex(entry => entry.token === token)
    if (at >= 0) runtimeResolvers.splice(at, 1)
  }
}
export function clearRuntimeThemeResolver(): void { runtimeResolvers.length = 0 }
function resolve(name: string): Theme | undefined {
  const custom = customResolver?.(name)
  if (custom) return normalizeThemePalette(custom)
  for (let i = runtimeResolvers.length - 1; i >= 0; i--) {
    const candidate = runtimeResolvers[i].resolver(name)
    if (candidate) return normalizeThemePalette(candidate)
  }
  return undefined
}
export function getTheme(name: ThemeName): Theme {
  if (name === AUTO_THEME_NAME) return builtIn[autoBase]
  if (isBuiltInThemeName(name)) return builtIn[name as (typeof THEME_NAMES)[number]]
  return resolve(name) ?? builtIn.dark
}
export function isThemeAvailable(name: ThemeName): boolean {
  return name === AUTO_THEME_NAME || isBuiltInThemeName(name) || resolve(name) !== undefined
}

function colorChannels(ink: string): [number, number, number] | undefined {
  const hex = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(ink)
  if (hex) {
    const raw = hex[1]
    if (raw.length === 3) return [...raw].map(digit => parseInt(digit + digit, 16)) as [number,number,number]
    return [0,2,4].map(at => parseInt(raw.slice(at, at + 2), 16)) as [number,number,number]
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(ink)
  if (!rgb) return undefined
  const channels = rgb.slice(1).map(Number)
  return channels.every(channel => channel <= 255) ? channels as [number,number,number] : undefined
}
function luminance(ink: string): number | undefined {
  const channels = colorChannels(ink)
  return channels && (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000
}
export function isLightThemeActive(name: ThemeName): boolean {
  if (name === AUTO_THEME_NAME) return autoBase === 'light'
  if (name === 'light' || name === 'claude-paper' || name === 'codex-paper') return true
  const level = luminance(getTheme(name).text)
  return level !== undefined && level < 128
}
export function cursorGlyphColor(theme: Theme): 'text' | 'inverseText' {
  const caret = theme.cursor === '' ? undefined : luminance(theme.cursor)
  if (caret === undefined) return 'inverseText'
  const ink = luminance(theme.text)
  const inverse = luminance(theme.inverseText)
  if (ink === undefined || inverse === undefined) return 'inverseText'
  return Math.abs(ink - caret) > Math.abs(inverse - caret) ? 'text' : 'inverseText'
}

let activeName: ThemeName = 'dark'
export function setActiveThemeName(name: ThemeName): void { activeName = name }
export function getActiveThemeName(): ThemeName { return activeName }
export function getActiveTheme(): Theme { return getTheme(activeName) }
