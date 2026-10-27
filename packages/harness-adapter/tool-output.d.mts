// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import type { AgentEvent } from '../protocol/agent/events.mjs';
export interface NativeOutputJob { readonly id: string; readonly owner?: string; readonly kind: string; }
export type NativeOutputEvent =
  | { readonly type: 'output'; readonly id: string }
  | { readonly type: 'registered' | 'progress' | 'stopping' | 'settled' | 'removed'; readonly job: NativeOutputJob };
export interface NativeOutputSource {
  events?: { subscribe(filter: { owner: string }, listener: (event: NativeOutputEvent) => void): () => void };
  readAt?(id: string, offset: number, owner: string): {
    readonly next: number; readonly lossy?: boolean;
    readonly chunks: readonly { readonly text: string; readonly channel?: string; readonly gapBefore?: boolean }[];
  };
}
export interface NativeOutputExecution<Agent> {
  readonly agent?: Agent; readonly name: string; readonly parent?: unknown; readonly callId: unknown;
}
/** Observe an owner-fenced ring; never consume the model cursor or execute tools. */
export function subscribeNativeToolOutput<Agent extends { readonly id: string }, Result>(bindings: {
  jobs?: NativeOutputSource;
  agent: Agent;
  publish(events: readonly AgentEvent[]): void;
  onExecute(listener: (execution: NativeOutputExecution<Agent>, next: () => Promise<Result>) => Promise<Result>): () => void;
  now?(): number;
}): () => void;
