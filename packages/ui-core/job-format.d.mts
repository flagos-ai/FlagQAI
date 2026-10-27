// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
/** Backend-neutral background-job formatting shared by the job stores, the
 *  transcript card, the `/jobs` panel and the status-line chip. */
import type { BackgroundJobState } from '../protocol/agent/channel-view.mjs';
/** `3s` under a minute, `3m12s` under an hour, `1h02m` beyond — transcript-card compact. */
export declare function formatJobDuration(job: Pick<BackgroundJobState, 'startedAt' | 'finishedAt'>, now?: number): string;
