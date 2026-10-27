// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
export interface StoredSession<Header, Event> {
  readonly meta: Header; readonly events: readonly Event[]; readonly inheritedEventCount?: number;
}
export interface SessionReader<Id, Header, Event> {
  load?(id: Id): Promise<StoredSession<Header, Event>>;
  open?(id: Id, access: 'read'): Promise<{
    readonly header: Header; readonly inheritedEventCount?: number;
    read(): Promise<{ readonly events: readonly Event[] }>;
    close(): Promise<void>;
  }>;
}
/** Prefer read handles over legacy loads, and close every acquired handle. */
export function createPersistedSessionReader<Id, Header, Event>(bindings: { prepare(): void }):
  (source: SessionReader<Id, Header, Event>, id: Id) => Promise<StoredSession<Header, Event>>;
