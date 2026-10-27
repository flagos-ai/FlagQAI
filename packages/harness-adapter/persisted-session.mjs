// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
/** A read-only compatibility boundary; native persistence remains authoritative. */
export function createPersistedSessionReader({ prepare }) {
  return async function readPersistedSession(source, id) {
    prepare();
    if (typeof source.open === 'function') {
      const handle = await source.open(id, 'read');
      try {
        const { events } = await handle.read();
        return { meta: handle.header, events, inheritedEventCount: handle.inheritedEventCount };
      } finally {
        await handle.close();
      }
    }
    if (typeof source.load === 'function') return source.load(id);
    throw new Error('flagqai: session persistence has no read API');
  };
}
