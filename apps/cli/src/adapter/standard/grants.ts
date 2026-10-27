/** Scoped, fail-closed grants backed by the pinned permission registry. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DATA_DIR} from '../../utils/paths.js';
import {EXPECTED_PERMISSIONS} from '../spec/protocol-constants.js';
import {assertCapabilityShadowPolicy, defaultAdapterRuntime, type AdapterRuntimeOptions} from '../kernel/runtime.js';
import {normalizePermissionScope, permissionScopeCovers} from './permission-scope.js';
import type {PermissionRegistry} from './types.js';

export const EXTENSION_GRANTS_FILE = 'extension-grants.json';

export interface GrantPrincipal {
  componentId: string;
  activationId?: string;
}
export interface GrantStore {
  allows(principal: GrantPrincipal | string, permission: string, scope: string): boolean;
  defaultOf(permission: string): 'allow' | 'deny';
  knownPermissions(): readonly string[];
  onChange?(listener: () => void): () => void;
  readonly corrupt: boolean;
}

type Rule = {name: string; scope: string; activationId?: string; unscopedDeny?: true};
type Table = ReadonlyMap<string, readonly Rule[]>;
type Snapshot = {grants: Table; denies: Table; corrupt: boolean};

const emptyTable: Table = new Map();
const invalid: Snapshot = {grants: emptyTable, denies: emptyTable, corrupt: true};
const directoryWatches = new Map<string, {
  timer: ReturnType<typeof setInterval>; listeners: Set<() => void>;
}>();

function observedFile(file: string): string {
  try { return `data:${readFileSync(file, 'utf8')}`; }
  catch (error) { return `error:${(error as NodeJS.ErrnoException).code ?? 'unknown'}`; }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function table(value: unknown, denySection: boolean): Table | undefined {
  if (value === undefined) return emptyTable;
  if (!record(value)) return undefined;
  const entries = new Map<string, readonly Rule[]>();
  for (const [componentId, rawRules] of Object.entries(value)) {
    if (!componentId || !Array.isArray(rawRules)) return undefined;
    const rules: Rule[] = [];
    for (const raw of rawRules) {
      // An old unscoped grant cannot authorize. An old unscoped deny must
      // still revoke the allow-default permission at every valid scope.
      if (typeof raw === 'string') {
        if (denySection) rules.push({name: raw, scope: '', unscopedDeny: true});
        continue;
      }
      if (!record(raw) || Object.keys(raw).some(key =>
        key !== 'name' && key !== 'scope' && key !== 'activationId') ||
        typeof raw.name !== 'string' || !raw.name ||
        typeof raw.scope !== 'string' || !raw.scope ||
        (raw.activationId !== undefined && (typeof raw.activationId !== 'string' || !raw.activationId))) return undefined;
      rules.push({name: raw.name, scope: raw.scope,
        ...(raw.activationId === undefined ? {} : {activationId: raw.activationId as string})});
    }
    entries.set(componentId, rules);
  }
  return entries;
}

function parse(text: string): Snapshot {
  if (!text.trim()) return {grants: emptyTable, denies: emptyTable, corrupt: false};
  try {
    const root: unknown = JSON.parse(text);
    if (!record(root) || Object.keys(root).some(key => key !== 'grants' && key !== 'denies')) return invalid;
    const grants = table(root.grants, false);
    const denies = table(root.denies, true);
    return grants && denies ? {grants, denies, corrupt: false} : invalid;
  } catch {
    return invalid;
  }
}

function principalOf(value: GrantPrincipal | string): GrantPrincipal | undefined {
  const principal = typeof value === 'string' ? {componentId: value} : value;
  return principal && typeof principal.componentId === 'string' && principal.componentId !== '' ? principal : undefined;
}

function store(
  snapshot: () => Snapshot, registry: PermissionRegistry,
  runtime: AdapterRuntimeOptions,
  subscribe?: (listener: () => void) => () => void,
): GrantStore {
  const policies = new Map(registry.permissions.map(row => [row.name, row.default] as const));
  const names = Object.freeze(registry.permissions.map(row => row.name));
  const matches = (rules: Table, principal: GrantPrincipal, permission: string, scope: string): boolean => {
    const actual = normalizePermissionScope(permission, scope, principal.componentId);
    if (!actual) return false;
    return (rules.get(principal.componentId) ?? []).some(rule => {
      if (rule.name !== permission || (rule.activationId !== undefined && rule.activationId !== principal.activationId)) return false;
      if (rule.unscopedDeny) return true;
      const declared = normalizePermissionScope(permission, rule.scope, principal.componentId);
      return declared !== undefined && permissionScopeCovers(permission, declared, actual);
    });
  };
  return Object.freeze({
    get corrupt() { return snapshot().corrupt; },
    knownPermissions() { return names; },
    defaultOf(permission) { return policies.get(permission) ?? 'deny'; },
    allows(value, permission, scope) {
      assertCapabilityShadowPolicy('host.grants.evaluate', runtime.mode, runtime.slices);
      const principal = principalOf(value);
      const current = snapshot();
      if (!principal || current.corrupt || !policies.has(permission)) return false;
      const actual = normalizePermissionScope(permission, scope, principal.componentId);
      if (!actual) return false;
      if (principal.activationId === undefined &&
        [...(current.denies.get(principal.componentId) ?? []),
          ...(current.grants.get(principal.componentId) ?? [])].some(rule =>
          rule.name === permission && rule.activationId !== undefined &&
          !rule.unscopedDeny &&
          (() => {
            const declared = normalizePermissionScope(permission, rule.scope, principal.componentId);
            return declared !== undefined && permissionScopeCovers(permission, declared, actual);
          })())) return false;
      if (matches(current.denies, principal, permission, scope)) return false;
      if (matches(current.grants, principal, permission, scope)) return true;
      return policies.get(permission) === 'allow';
    },
    ...(subscribe === undefined ? {} : {
      onChange(listener: () => void) {
        assertCapabilityShadowPolicy('host.grants.subscribe', runtime.mode, runtime.slices);
        return subscribe(listener);
      },
    }),
  });
}

function permissionRegistry(override?: PermissionRegistry): PermissionRegistry {
  return override ?? {registryVersion: '0.1', permissions: [...EXPECTED_PERMISSIONS]};
}

export function parseGrantStore(
  text: string, registry?: PermissionRegistry, runtime: AdapterRuntimeOptions = defaultAdapterRuntime(),
): GrantStore {
  const current = parse(text);
  return store(() => current, permissionRegistry(registry), runtime);
}

/** Each decision reads the current file, including revocations and I/O errors. */
export function readGrantStore(
  dir: string = DATA_DIR, registry?: PermissionRegistry, runtime: AdapterRuntimeOptions = defaultAdapterRuntime(),
): GrantStore {
  const file = join(dir, EXTENSION_GRANTS_FILE);
  const current = (): Snapshot => {
    try { return parse(readFileSync(file, 'utf8')); }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? parse('') : invalid; }
  };
  return store(current, permissionRegistry(registry), runtime, listener => {
    let shared = directoryWatches.get(dir);
    if (!shared) {
      const listeners = new Set<() => void>();
      let previous = observedFile(file);
      const timer = setInterval(() => {
        const next = observedFile(file);
        if (next === previous) return;
        previous = next;
        for (const notify of [...listeners]) notify();
      }, 50);
      timer.unref();
      shared = {timer, listeners};
      directoryWatches.set(dir, shared);
    }
    shared.listeners.add(listener);
    return () => {
      shared.listeners.delete(listener);
      if (shared.listeners.size === 0 && directoryWatches.get(dir) === shared) {
        directoryWatches.delete(dir);
        clearInterval(shared.timer);
      }
    };
  });
}
