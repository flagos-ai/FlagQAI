/** Identity assigned by the host to the activation that owns a resource. */
export interface HostOwnerRef {
  readonly componentId: string
  /** Absent for host-owned resources that have no plugin activation. */
  readonly activationId?: string
}

/** Release a host registration or subscription when its owner unmounts. */
export type HostDisposer = () => void

/** Policy class attached to a host operation before shadow-mode admission. */
export type HostEffectClass = 'read-only' | 'subscribe' | 'register' | 'mutate'
