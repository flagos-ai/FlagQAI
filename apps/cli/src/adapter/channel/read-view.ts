/** Detached, immutable read values for the in-process renderer boundary. */

const revisions = new WeakMap<object, number>();

/** Signal that a source container changed in place before its next projection. */
export function markChannelReadDirty(value: object): void {
  revisions.set(value, (revisions.get(value) ?? 0) + 1);
}

type Entry = { revision: number; value: unknown };

function isRecord(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Keep non-structural leaves (binary views, Dates, class instances) intact.
 * Only arrays and ordinary records are detached; executable fields retain the
 * owning lease and are checked again after asynchronous completion.
 */
export function createChannelReadView(check: (mutation: boolean) => void): <T>(value: T, nextVersion: number) => T {
  const cache = new WeakMap<object, Entry>();

  const copy = (input: unknown, seen: WeakMap<object, unknown>, owner?: object, refresh = false): unknown => {
    if (typeof input === 'function') {
      const callable = input;
      return (...args: unknown[]) => {
        check(true);
        const result: unknown = Reflect.apply(callable, owner, args);
        if (result instanceof Promise) {
          return result.then(value => {
            check(false);
            return copy(value, new WeakMap());
          });
        }
        check(false);
        return copy(result, new WeakMap());
      };
    }
    if (input === null || typeof input !== 'object') return input;
    if (!Array.isArray(input) && !isRecord(input)) return input;
    const prior = seen.get(input);
    if (prior !== undefined) return prior;
    const revision = revisions.get(input) ?? 0;
    const saved = cache.get(input);
    if (!refresh && saved?.revision === revision) return saved.value;
    // A marked record may have changed a nested plain value in place. A
    // marked list, in contrast, often only appended a row: retain the older
    // row snapshots so a long transcript is not copied on every append.
    const refreshChildren = refresh || (saved !== undefined && !Array.isArray(input));

    const output: Record<PropertyKey, unknown> | unknown[] = Array.isArray(input)
      ? new Array(input.length) : Object.create(Object.getPrototypeOf(input)) as Record<PropertyKey, unknown>;
    seen.set(input, output);
    for (const key of Reflect.ownKeys(input)) {
      if (Array.isArray(input) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (descriptor === undefined || !descriptor.enumerable) continue;
      Object.defineProperty(output, key, {
        configurable: true, enumerable: true, writable: true,
        value: copy(Reflect.get(input, key), seen, input, refreshChildren && !Array.isArray(input)),
      });
    }
    Object.freeze(output);
    cache.set(input, {revision, value: output});
    return output;
  };

  return <T>(value: T, _nextVersion: number): T => {
    check(false);
    return copy(value, new WeakMap()) as T;
  };
}
