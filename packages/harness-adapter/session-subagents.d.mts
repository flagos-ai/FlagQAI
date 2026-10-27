// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import type { SessionCapabilities } from '../protocol/agent/capabilities.mjs';
import type { AgentEvent } from '../protocol/agent/events.mjs';
import type { ChildSessionEvent, ChildTranscriptReader, ChildCatalogService, ChildPersistenceSource, ChildSessionsStore } from './child-transcript.mjs';
export interface NativeChildRun {
  readonly id: string; readonly runId?: string; readonly stopReason?: string;
  readonly lastAssistantMessage?: readonly { readonly text?: unknown }[];
}
export interface NativeSubagentsBindings<Agent extends { readonly session: object & { readonly id: unknown } }, Event extends ChildSessionEvent> {
  readonly agent: Agent;
  createTranslator(): { translateEvent(event: Event): readonly AgentEvent[] };
  readonly readChildTranscriptPage: ChildTranscriptReader<Event>;
  service(): ChildCatalogService | undefined;
  lookupChild(id: string): { readonly status?: string; readonly session?: unknown; readonly options?: { readonly model?: string } } | undefined;
  persistence(): ChildPersistenceSource<Event> | undefined;
  sessionsStore(): ChildSessionsStore | undefined;
  carrierKeyOf(scope: unknown): unknown;
  onStart(listener: (this: unknown, run: NativeChildRun) => void): () => void;
  onEnd(listener: (this: unknown, run: NativeChildRun) => void): () => void;
}
export function createNativeSubagentsCapability<Agent extends { readonly session: object & { readonly id: unknown } }, Event extends ChildSessionEvent>(bindings: NativeSubagentsBindings<Agent, Event>): {
  readonly capability: SessionCapabilities['subagents'];
  observe(): () => void;
  dispose(): void;
};
