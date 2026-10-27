// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import type { SessionCapabilities, SessionJobView } from '../protocol/agent/capabilities.mjs';
export interface NativeJobSnapshot {
  readonly id: string; readonly owner?: string; readonly kind: string; readonly label: string;
  readonly status: SessionJobView['status']; readonly startedAt: number; readonly finishedAt?: number;
  readonly detail?: string; readonly progress?: string;
  readonly output?: { readonly total: number; readonly earliest: number };
}
/** Non-consuming registry access with an exact native owner id. */
export interface NativeJobsSource {
  list(caller?: string): readonly NativeJobSnapshot[];
  kill(id: string, caller?: string, reason?: string): unknown;
  readAt?(id: string, from: number, caller?: string): {
    readonly chunks: readonly { readonly text: string; readonly channel?: string; readonly gapBefore?: boolean }[];
    readonly lossy?: boolean;
  };
}
export function createNativeJobsCapability(jobs: NativeJobsSource | undefined, owner: string): SessionCapabilities['jobs'];
