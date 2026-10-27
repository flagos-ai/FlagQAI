/** Credential references owned by the host may not be claimed by plugins. */
const HOST_PREFIXES = ['DEEPSEEK_', 'DSH_', 'FLAGQAI_'] as const

export function isReservedCredentialRef(ref: string): boolean {
  // Environment keys are case-insensitive on Windows. Guard the same host
  // namespace on every platform, including values padded by a caller.
  const key = ref.trim().toUpperCase()
  return HOST_PREFIXES.some(prefix => key.startsWith(prefix))
}

interface SecretField {
  readonly path: readonly string[]
  readonly secret?: { readonly ref: string }
}

export interface RejectedSecretRef {
  readonly path: readonly string[]
  readonly ref: string
}

/** Drop only forbidden secret fields; preserve the section and allowed fields. */
export function vetSectionSecretRefs<S extends { readonly fields: readonly SecretField[] }>(
  section: S,
): { section: S; rejected: RejectedSecretRef[] } {
  const rejected: RejectedSecretRef[] = []
  const fields = section.fields.filter(field => {
    const ref = field.secret?.ref
    if (ref === undefined || !isReservedCredentialRef(ref)) return true
    rejected.push({ path: field.path, ref })
    return false
  })
  return {
    section: fields.length === section.fields.length ? section : { ...section, fields },
    rejected,
  }
}
