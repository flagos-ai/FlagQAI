/** Kernel rows shared by the launchpad and picker. Detection is supplied by the host. */
import { KERNEL_IDS, KERNEL_INFO, isKernelId, type KernelBackendId } from '../kernelPrefs.js'
import type { KernelStatus } from '../agent/backend.js'
export { kernelDisplayName } from '../kernelPrefs.js'
export type { KernelStatus } from '../agent/backend.js'

export type KernelUnavailableReason =
  | 'kernel-unavailable-not-installed'
  | 'kernel-unavailable-auth-missing'
  | 'kernel-probing'
  /** Installed, but older than the backend supports (its hint says how to upgrade). */
  | 'kernel-unavailable-too-old'

/** Product-qualified version; unknown kernels keep the raw version. */
export function kernelVersionLabel(id: string, version?: string): string | undefined {
  if (version === undefined || version === '') return undefined
  return isKernelId(id) ? KERNEL_INFO[id].product + ' v' + version : version
}

export interface KernelOption {
  readonly id: KernelBackendId
  readonly labelKey: string
  readonly current: boolean
  readonly selectable: boolean
  readonly reasonKey?: KernelUnavailableReason
  /** A selectable row's caveat (signed out, but `/login` works in-session). */
  readonly noteKey?: 'kernel-login-in-session'
  /** An unavailable row's own guidance from detection (install / upgrade). */
  readonly hint?: string
  readonly version?: string
}

/** The Harness kernel is always available. */
export function buildKernelCatalog(input: {
  readonly current: string
  readonly dshVersion?: string
  readonly statuses?: Readonly<Record<string, KernelStatus>>
}): readonly KernelOption[] {
  return KERNEL_IDS.map(id => {
    const status = input.statuses?.[id]
    const signInLater = status?.auth === 'missing' && status.loginInSession === true
    const selectable = id === 'dsh' || (status !== undefined && status.installed && (status.auth !== 'missing' || signInLater))
    const reasonKey: KernelUnavailableReason = status === undefined
      ? 'kernel-probing'
      : status.installed && status.auth === 'missing'
        ? 'kernel-unavailable-auth-missing'
        : 'kernel-unavailable-not-installed'
    const version = kernelVersionLabel(id, id === 'dsh' ? input.dshVersion : status?.version)
    return {
      id,
      labelKey: KERNEL_INFO[id].labelKey,
      current: input.current === id,
      selectable,
      ...(selectable ? {} : { reasonKey }),
      ...(selectable || status?.hint === undefined || status.hint === '' ? {} : { hint: status.hint }),
      ...(selectable && signInLater ? { noteKey: 'kernel-login-in-session' as const } : {}),
      ...(version === undefined ? {} : { version }),
    }
  })
}

/** Join the available version and unavailability reason without an empty subtitle. */
export function kernelSubtitle(
  option: KernelOption,
  reason: (key: KernelUnavailableReason | 'kernel-login-in-session') => string,
): string | undefined {
  const parts: string[] = []
  if (option.version !== undefined && option.version !== '') parts.push(option.version)
  if (option.reasonKey !== undefined) parts.push(reason(option.reasonKey))
  if (option.noteKey !== undefined) parts.push(reason(option.noteKey))
  return parts.length === 0 ? undefined : parts.join(' \u00b7 ')
}
