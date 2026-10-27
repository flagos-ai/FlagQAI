// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import type { SessionCapabilities } from '../protocol/agent/capabilities.mjs';
export function createNativeCompaction<Agent extends { readonly status: string; readonly session: { readonly id: unknown; readonly header: { readonly cwd?: string } } }>(bindings: {
  readonly agent: Agent;
  readonly service?: { compactNow(agent: Agent, signal: AbortSignal): Promise<unknown> };
  decide(input: { readonly sessionId: string; readonly cwd: string }): Promise<unknown>;
}): { readonly capability: SessionCapabilities['compact']; dispose(): Promise<void> };
