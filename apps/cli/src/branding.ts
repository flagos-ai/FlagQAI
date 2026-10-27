/**
 * Product skin is independent of the Agent backend. `auto` uses FlagQAI;
 * inherited DeepSeek, Claude and Codex looks remain explicit choices. A
 * selected theme still takes precedence over a skin's default theme pair.
 */

/** One product skin: splash words, tagline, and an optional theme pair. */
export type Brand = 'flagqai' | 'deepseek' | 'claude' | 'codex'

// 设置值类型住在端口的显示偏好词汇表里（ports 目录不许 import 到目录外），
// 这里转出去：设置链（Config / channel / /settings 面板）只认这一个入口。
export type { BrandSetting } from './adapter/ports/channel-display.js'
import type { BrandSetting } from './adapter/ports/channel-display.js'

/** 设置项的合法值表（注册与归一化共用一份）。 */
export const BRAND_SETTING_VALUES: readonly BrandSetting[] = ['auto', 'flagqai', 'deepseek', 'claude', 'codex']

/**
 * 归一化不可信来源的设置值：合法值原样通过，其余（含未设置）回落 `auto`。
 */
export function normalizeBrandSetting(value: unknown): BrandSetting {
  return typeof value === 'string' && (BRAND_SETTING_VALUES as readonly string[]).includes(value)
    ? (value as BrandSetting)
    : 'auto'
}

/** Default product skin for any backend. */
export function brandOfBackend(backendId: string | undefined): Brand {
  // A backend supplies Agent behavior, not the identity of the FlagQAI client.
  // Keep the argument for callers and future per-backend policy, but never
  // change the default product skin when a user switches runtimes.
  void backendId
  return 'flagqai'
}

/** Resolve an explicit preview override, saved skin, or FlagQAI default. */
export function resolveBrand(setting: BrandSetting | undefined, backendId: string | undefined): Brand {
  const forced = process.env.FLAGQAI_BRAND
  if (forced === 'flagqai' || forced === 'claude' || forced === 'deepseek' || forced === 'codex') return forced
  if (setting === 'flagqai' || setting === 'claude' || setting === 'deepseek' || setting === 'codex') return setting
  return brandOfBackend(backendId)
}

/** 一副开屏标题词：两行大字 + 窄终端纯文字档。 */
export interface BrandSplashWords {
  readonly top: string
  readonly bottom: string
  readonly plain: string
}

/** 各品牌的开屏标题词（大字重解字距见 `splashFonts.withTagline`）。 */
export const BRAND_SPLASH_WORDS: Readonly<Record<Brand, BrandSplashWords>> = Object.freeze({
  flagqai: Object.freeze({ top: 'FLAGQAI', bottom: 'CLI', plain: 'FlagQAI CLI' }),
  deepseek: Object.freeze({ top: 'DEEPSEEK', bottom: 'HARNESS', plain: 'DeepSeek Harness' }),
  claude: Object.freeze({ top: 'CLAUDE', bottom: 'CODE', plain: 'Claude Code' }),
  codex: Object.freeze({ top: 'CODEX', bottom: 'HARNESS', plain: 'Codex' }),
})

/** claude 品牌按终端深浅落的两套内置主题（theme.ts 注册：墨黑 / 暖纸张，
 *  共用同一套陶土橙强调色——切明暗不丢品牌识别）。 */
export const CLAUDE_BRAND_THEMES: Readonly<{ dark: 'claude-dark'; light: 'claude-paper' }> = Object.freeze({
  dark: 'claude-dark',
  light: 'claude-paper',
})

/** codex 品牌双主题（theme.ts 注册）：黑白基底 + 薰衣草紫点缀（用户定稿
 *  「Codex Lavender」方案——90% 黑白灰、8% 紫、2% 功能色；紫只做点睛）。
 *  深底 `codex-lavender`（#A69BE8 主色）、浅底 `codex-paper`（#8A7ED9
 *  深化主色），同一套紫强调色，切明暗不丢品牌识别。 */
export const CODEX_BRAND_THEMES: Readonly<{ dark: 'codex-lavender'; light: 'codex-paper' }> = Object.freeze({
  dark: 'codex-lavender',
  light: 'codex-paper',
})

/** 带品牌主题的档位 → 主题对（ThemeProvider 的品牌默认档查这里；deepseek
 *  用系统默认 light/dark，不在表内）。 */
export const BRAND_THEMES: Readonly<Partial<Record<Brand, { readonly dark: string; readonly light: string }>>> = Object.freeze({
  claude: CLAUDE_BRAND_THEMES,
  codex: CODEX_BRAND_THEMES,
})

/** 开屏欢迎语（品牌档；deepseek 沿用 i18n 的 `logo-tagline`）。英文两行以
 *  `\n` 分隔，渲染层按行拆开居中。 */
export const BRAND_TAGLINE: Readonly<Record<Brand, { readonly zh: string; readonly en: string }>> = Object.freeze({
  flagqai: Object.freeze({ zh: 'Quantum AI', en: 'Quantum AI' }),
  deepseek: Object.freeze({ zh: '', en: '' }),
  codex: Object.freeze({ zh: '用 Codex 构建一切', en: 'Build anything with Codex' }),
  claude: Object.freeze({ zh: '创造精彩，守护关键。', en: "Create what's exciting.\nMaintain what's essential." }),
})

/** `/settings` 里 `flagqai.brand` 的选项（结构与 `SPLASH_FONT_OPTIONS` 同形）。 */
export const BRAND_SETTING_OPTIONS: readonly {
  readonly value: BrandSetting
  readonly label: string
  readonly descriptions: { readonly zh: string }
}[] = [
  { value: 'auto', label: 'FlagQAI (default)', descriptions: { zh: 'FlagQAI（默认）' } },
  { value: 'flagqai', label: 'FlagQAI', descriptions: { zh: 'FlagQAI' } },
  { value: 'deepseek', label: 'DeepSeek (mist blue)', descriptions: { zh: 'DeepSeek（雾蓝）' } },
  { value: 'claude', label: 'Claude Code (orange)', descriptions: { zh: 'Claude Code（橙）' } },
  { value: 'codex', label: 'Codex (lavender)', descriptions: { zh: 'Codex（薰衣草紫）' } },
]

// ── 品牌的运行时镜像（ThemeProvider 在 Chat 外层，拿不到 channel prop） ──────
// 与 theme.ts 的 autoBase 镜像同一思路：plugin 在首帧渲染前 `setActiveBrand`
// 铺好初值（避免蓝→橙闪一下），Chat 在品牌变化时跟进更新；
// ThemeProvider 用 useSyncExternalStore 订阅，切档即时生效。

let activeBrand: Brand = 'flagqai'
const brandListeners = new Set<() => void>()

/** 更新当前品牌（值不变时无操作）。 */
export function setActiveBrand(brand: Brand): void {
  if (brand === activeBrand) return
  activeBrand = brand
  for (const listener of brandListeners) listener()
}

/** Current skin before and after theme-provider synchronization. */
export function getActiveBrand(): Brand {
  return activeBrand
}

/** 订阅品牌变化（`useSyncExternalStore` 的订阅缝）。 */
export function subscribeActiveBrand(listener: () => void): () => void {
  brandListeners.add(listener)
  return () => {
    brandListeners.delete(listener)
  }
}
