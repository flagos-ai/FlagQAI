// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
import type { ProjectionHost } from './projection.mjs'
import type { ActivityHost } from './activity.mjs'
export interface HistoryHost { projection: ProjectionHost; activity: ActivityHost }
import type { ChatRow } from '../protocol/agent/channel-view.mjs';
import type { AgentEvent } from '../protocol/agent/events.mjs';
import { type ProjectionState } from './projection.mjs';
/** Whether the durable record can restore a row (the fold predicate). */
export declare function anchoredRow(row: ChatRow): boolean;
/** Restore folded rows from a durable record; returns the rows restored. */
export declare function restoreFoldedRows(rows: ChatRow[], record: readonly AgentEvent[], host: HistoryHost): number;
/** Paint an older history slice into fresh rows (settled, no live effects). */
export declare function projectHistorySlice(events: readonly AgentEvent[], thinkingFold: ProjectionState['thinkingFold'], host: HistoryHost): ChatRow[];
/**
 * Put older rows ahead of the transcript: restored (never folded again),
 * not fresh (no reveal animation), ids below every row already there.
 * Returns the rows prepended.
 */
export declare function prependHistoryRows(rows: ChatRow[], older: readonly ChatRow[], host: HistoryHost): number;
