import type { ProviderSetupHost } from '../adapter/ports/channel-settings.js'
import type { ProviderManager } from '../../../../packages/harness-adapter/provider-manager.mjs'
import { deriveKeyRef } from './providerWizard.js'

export type { ProviderDraft, ProviderConfiguration, ProviderManager } from '../../../../packages/harness-adapter/provider-manager.mjs'

/** Bind native settings and credentials to the shared provider service. */
export async function createProviderManager(
  host: ProviderSetupHost,
  selectModel: (provider: string, model: string) => boolean,
): Promise<ProviderManager> {
  // The publish build copies this package beside the compiled native adapter.
  const modulePath = '../../flagqai-platform/harness-adapter/provider-manager.mjs'
  const { createProviderManager: createSharedProviderManager } = await import(modulePath) as typeof import('../../../../packages/harness-adapter/provider-manager.mjs')
  return createSharedProviderManager(host, selectModel, deriveKeyRef)
}
