// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import type { SessionCapabilities } from '../protocol/agent/capabilities.mjs';
export interface NativeActionSession<Id> { readonly id: Id; readonly header: { readonly version: number; readonly cwd?: string } }
export interface NativeForkEvent { readonly seq: number; readonly type: string }
export interface NativeForkCreate<Session, Event, Id, Composition> {
  readonly sessionId: Id; readonly seed: Event[]; readonly inheritedCount: number;
  readonly runtimeSession: Session; readonly cwd: string; readonly parentSession?: Id;
  readonly composed: Composition; readonly closeTurn?: number;
}
export interface NativeForkBindings<Session, Event, Id, Composition> {
  snapshot(): readonly Event[];
  seed(): readonly Event[];
  target(events: readonly Event[], seq: number): { readonly boundary: number; readonly closeTurn?: number };
  appendInterruptedTurnEnd(seed: Event[], turn: number): void;
  compose(): Promise<Composition>;
  createId(): Id;
  reserve(id: string): Promise<{ readonly reservation: { abandon(): void } }>;
  create(input: NativeForkCreate<Session, Event, Id, Composition>): Promise<{ readonly agent: { readonly session: Session }; dispose(): Promise<void> }>;
  recordModelSelection(session: Session): void;
  attach(cwd: string, id: Id): Promise<unknown>;
  release(id: string): unknown;
}
export function createNativeSessionActions<Id, Session extends NativeActionSession<Id>, Event extends NativeForkEvent, Composition>(bindings: {
  readonly agent: { readonly status: string; readonly session: Session };
  appendTitle(session: Session, title: string): void;
  readonly fork?: NativeForkBindings<Session, Event, Id, Composition>;
}): Pick<SessionCapabilities, 'rename' | 'fork'>;
