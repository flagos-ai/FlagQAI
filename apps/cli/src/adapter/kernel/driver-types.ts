/** Two-part address of a protocol contract known to a host driver. */
export interface ContractCoordinate {
  readonly apiVersion: string
  readonly kind: string
}

/** A manifest requirement may be optional only with an explicit fallback. */
export interface ContractRef extends ContractCoordinate {
  readonly optional?: boolean
  readonly fallback?: string
}
