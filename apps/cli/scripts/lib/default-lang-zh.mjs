/**
 * Import FIRST in a headless script whose assertions check Chinese notice
 * text: pins FLAGQAI_LANG=zh before the i18n module evaluates (ESM imports
 * run in order, so this side effect lands ahead of the lib imports).
 */
process.env.FLAGQAI_LANG = 'zh'
