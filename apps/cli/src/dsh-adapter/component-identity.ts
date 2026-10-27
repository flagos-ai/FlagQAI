import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ComponentManifest, PluginManifest } from '../adapter/standard/types.js'
import { normalizePermissionScope, scopeCovers } from '../adapter/standard/permission-scope.js'
import { activationFiber, bindCallerEffect } from './host-access.js'

export type ComponentIdentityErrorCode = 'COMPONENT_NOT_ADMITTED' | 'COMPONENT_ALREADY_ADMITTED'

export class ComponentIdentityError extends Error {
  constructor(readonly code: ComponentIdentityErrorCode, message: string) {
    super(message)
    this.name = 'ComponentIdentityError'
  }
}

export interface VerifiedComponentIdentity {
  readonly componentId: string
  readonly version: string
  readonly facet: 'host'
  readonly activationId: string
  readonly manifest: PluginManifest
  readonly projection: ComponentManifest
}

export const ACTIVATION_ID_MAX_LENGTH = 128

// A Cordis context is extensible; the authenticated activation fiber is the
// only stable owner for an admitted component and its teardown callback.
const admitted = new WeakMap<object, VerifiedComponentIdentity>()

export function bindComponentIdentity(
  context: Context,
  manifest: PluginManifest,
  projection: ComponentManifest,
  activationId: string = randomUUID(),
): VerifiedComponentIdentity {
  const fiber = activationFiber(context)
  if (fiber === undefined) {
    throw new ComponentIdentityError('COMPONENT_NOT_ADMITTED', 'Component activation is not live')
  }
  if (admitted.has(fiber)) {
    throw new ComponentIdentityError('COMPONENT_ALREADY_ADMITTED', 'Component activation is already admitted')
  }
  if (manifest.id !== projection.metadata.name || manifest.version !== projection.metadata.version) {
    throw new ComponentIdentityError('COMPONENT_NOT_ADMITTED', 'Component projection does not match its manifest')
  }
  if (typeof activationId !== 'string' || activationId.length === 0
    || activationId.length > ACTIVATION_ID_MAX_LENGTH || /[\u0000-\u001f\u007f-\u009f]/u.test(activationId)) {
    throw new ComponentIdentityError('COMPONENT_NOT_ADMITTED', 'Invalid component activation identifier')
  }

  const identity: VerifiedComponentIdentity = Object.freeze({
    componentId: manifest.id,
    version: manifest.version,
    facet: 'host',
    activationId,
    manifest,
    projection,
  })
  admitted.set(fiber, identity)
  if (!bindCallerEffect(context, () => {
    if (admitted.get(fiber) === identity) admitted.delete(fiber)
  })) {
    admitted.delete(fiber)
    throw new ComponentIdentityError('COMPONENT_NOT_ADMITTED', 'Component activation ended during admission')
  }
  return identity
}

export function componentIdentityOf(context: Context): VerifiedComponentIdentity | undefined {
  const fiber = activationFiber(context)
  return fiber === undefined ? undefined : admitted.get(fiber)
}

export function requireComponentIdentity(context: Context): VerifiedComponentIdentity {
  const identity = componentIdentityOf(context)
  if (identity === undefined) {
    throw new ComponentIdentityError('COMPONENT_NOT_ADMITTED', 'Component is not admitted')
  }
  return identity
}

export function declaresPermission(
  identity: VerifiedComponentIdentity,
  permission: string,
  actualScope: string,
): boolean {
  const actual = normalizePermissionScope(permission, actualScope, identity.componentId)
  if (actual === undefined) return false
  return identity.manifest.permissions.some(request => {
    if (request.name !== permission) return false
    const declared = normalizePermissionScope(permission, request.scope, identity.componentId)
    return declared !== undefined && scopeCovers(declared, actual)
  })
}

export function declaresCommand(identity: VerifiedComponentIdentity, commandId: string): boolean {
  return identity.manifest.contributes.commands.some(command => command.id === commandId)
}

export function declaresObserverScope(identity: VerifiedComponentIdentity, actualScope: string): boolean {
  const actual = normalizePermissionScope('messages.observe.read', actualScope, identity.componentId)
  if (actual === undefined) return false
  return identity.manifest.subscriptions.some(subscription => {
    if (typeof subscription === 'string'
      || subscription.apiVersion !== 'messages.dsh/v1alpha1'
      || subscription.kind !== 'MessageObserver'
      || subscription.scope === undefined) return false
    const declared = normalizePermissionScope('messages.observe.read', subscription.scope, identity.componentId)
    return declared !== undefined && scopeCovers(declared, actual)
  })
}

export function requiresContract(identity: VerifiedComponentIdentity, apiVersion: string, kind: string): boolean {
  return identity.manifest.requires.contracts.some(contract =>
    contract.apiVersion === apiVersion && contract.kind === kind)
}

export function requiresDecisionEvents(identity: VerifiedComponentIdentity): boolean {
  return requiresContract(identity, 'tui.dsh/v1alpha1', 'DecisionEvents')
}
