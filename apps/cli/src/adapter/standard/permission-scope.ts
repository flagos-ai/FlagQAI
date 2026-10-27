/** Executable permission scopes shared by admission, grants, and delivery. */
import {
  EXPECTED_PERMISSIONS, INTERCEPT_PERMISSIONS, INTERCEPT_EVENT_SCOPE_BY_PERMISSION,
  TUI_EVENT_SCOPE_NAMES,
} from '../spec/protocol-constants.js';

export {INTERCEPT_PERMISSIONS, INTERCEPT_EVENT_SCOPE_BY_PERMISSION, TUI_EVENT_SCOPE_NAMES};

export const STORAGE_PERMISSIONS = new Set(
  EXPECTED_PERMISSIONS.filter(row => row.name.startsWith('storage.local.')).map(row => row.name),
);
export const SESSION_SCOPE_MAX_CHARS = 256;

export type ScopeKind = 'component' | 'command' | 'session' | 'event';
export interface NormalizedPermissionScope {
  kind: ScopeKind;
  value: string;
}

const safeCommand = /^[\p{L}\p{N}_.-]+$/u;

function sessionScope(scope: string): NormalizedPermissionScope | undefined {
  if (!scope.startsWith('session:') || scope.length > SESSION_SCOPE_MAX_CHARS) return undefined;
  const id = scope.slice('session:'.length);
  if (id !== '*' && (!id || id.includes('*') || /[\u0000-\u001f\u007f-\u009f]/u.test(id))) return undefined;
  return {kind: 'session', value: id};
}

/** Reject scopes that this adapter cannot enforce exactly. */
export function normalizePermissionScope(
  permission: string, scope: string, componentId: string,
): NormalizedPermissionScope | undefined {
  if (!componentId || typeof scope !== 'string') return undefined;
  if (STORAGE_PERMISSIONS.has(permission)) {
    return scope === componentId ? {kind: 'component', value: componentId} : undefined;
  }
  if (permission === 'commands.invoke') {
    if (!safeCommand.test(scope) || scope.length > 256) return undefined;
    return {kind: 'command', value: scope};
  }
  if (permission === 'messages.observe.read') return sessionScope(scope);
  if (INTERCEPT_PERMISSIONS.has(permission)) {
    const event = INTERCEPT_EVENT_SCOPE_BY_PERMISSION[permission];
    if (scope === event && TUI_EVENT_SCOPE_NAMES.has(scope)) return {kind: 'event', value: scope};
    return sessionScope(scope);
  }
  return undefined;
}

export function scopeCovers(declared: NormalizedPermissionScope, actual: NormalizedPermissionScope): boolean {
  return declared.kind === actual.kind &&
    (declared.value === actual.value ||
      (declared.kind === 'session' && declared.value === '*'));
}

/** A decision event point can govern its concrete session; the reverse cannot. */
export function permissionScopeCovers(
  permission: string, declared: NormalizedPermissionScope, actual: NormalizedPermissionScope,
): boolean {
  if (scopeCovers(declared, actual)) return true;
  return INTERCEPT_PERMISSIONS.has(permission) && declared.kind === 'event' && actual.kind === 'session' &&
    INTERCEPT_EVENT_SCOPE_BY_PERMISSION[permission] === declared.value;
}

export function rawScopeCovers(permission: string, declared: string, actual: string, componentId: string): boolean {
  const grant = normalizePermissionScope(permission, declared, componentId);
  const operation = normalizePermissionScope(permission, actual, componentId);
  return grant !== undefined && operation !== undefined && permissionScopeCovers(permission, grant, operation);
}
