import type { Context } from '@deepseek-ai/cordis'
import { registerBundledPresets } from './bundled-presets.js'
import { ensurePackagedPresets } from './packaged-presets.js'

/** Native service bindings; shared initialization belongs to harness-adapter. */
export async function initializeSessionPresets(ctx: Context): Promise<void> {
  const adapterPath = '../../flagqai-platform/harness-adapter/index.mjs'
  const { initializeHarnessPresets } = await import(adapterPath) as {
    initializeHarnessPresets(input: {
      registerBundled(): Promise<boolean>
      ensurePackaged(): ReturnType<typeof ensurePackagedPresets>
      warn(message: string): void
    }): Promise<void>
  }
  await initializeHarnessPresets({
    registerBundled: () => registerBundledPresets(ctx),
    ensurePackaged: ensurePackagedPresets,
    warn: message => ctx.logger.warn(message),
  })
}
