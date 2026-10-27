// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import type { AgentEvent, ContentBlockView } from '../protocol/agent/events.mjs';
import type { SubagentTranscriptPage, SubagentTranscriptWindow } from '../protocol/agent/capabilities.mjs';
export const CHILD_TRANSCRIPT_PAGE_EVENTS: 400;
export interface ChildSessionEvent { readonly type: string; readonly data?: unknown }
export interface ChildTranscriptCapture { readonly sessionId: string; readonly generation: number; readonly session: object }
export interface ChildPersistenceSource<Event extends ChildSessionEvent = ChildSessionEvent> {
  stat?(id: string, options?: { readonly signal?: AbortSignal }): Promise<{ readonly eventCount?: unknown } | undefined>;
  open(id: string, access: 'read', options?: { readonly signal?: AbortSignal }): Promise<ChildPersistenceHandle<Event>>;
}
export interface ChildPersistenceHandle<Event extends ChildSessionEvent = ChildSessionEvent> {
  readonly id: unknown;
  readonly header: { readonly version?: unknown; readonly id?: unknown; readonly parentSession?: unknown; readonly isSeeded?: unknown };
  readonly inheritedEventCount?: unknown;
  read(offset?: number, length?: number, options?: { readonly signal?: AbortSignal }): Promise<{ readonly events: readonly Event[] }>;
  close(): Promise<void>;
}
export interface ChildSessionsStore { flush(session: object): Promise<unknown> }
export interface ChildCatalogEntry {
  readonly id: string; readonly createdAt: number; readonly mode: 'one-shot' | 'continuable' | 'unknown'; readonly label?: string;
}
export interface ChildCatalogService {
  interrupt?(target: string, reason: unknown): void;
  listChildren?(parentSessionId: string, signal?: AbortSignal): Promise<readonly ChildCatalogEntry[]>;
}
export interface ChildTranscriptDeps<Event extends ChildSessionEvent = ChildSessionEvent> {
  capture(): ChildTranscriptCapture | undefined;
  isCurrent(capture: ChildTranscriptCapture): boolean;
  subagents(): ChildCatalogService | undefined;
  persistence(): ChildPersistenceSource<Event> | undefined;
  sessionsStore(): ChildSessionsStore | undefined;
  lookupChild(id: string): { readonly session?: unknown } | undefined;
  createTranslator(): { translateEvent(event: Event): readonly AgentEvent[] };
  readonly ownerSignal?: AbortSignal;
}
export type ChildTranscriptReader<Event extends ChildSessionEvent> = (deps: ChildTranscriptDeps<Event>, agentId: string, window?: SubagentTranscriptWindow) => Promise<SubagentTranscriptPage | null>;
/** Vendor format and content helpers remain supplied by the native host. */
export function createChildTranscriptReader<Event extends ChildSessionEvent>(bindings: {
  readonly formatVersion: number;
  textOfBlocks(blocks: readonly ContentBlockView[] | undefined): string;
  toolErrorText(event: Event): string;
}): ChildTranscriptReader<Event>;
