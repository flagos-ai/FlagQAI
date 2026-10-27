// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
import type { NotificationItem, AgentMessageView, BackgroundJobState, ChatRow, SubagentState } from '../protocol/agent/channel-view.mjs';
import type { AgentEvent, AgentEventOf } from '../protocol/agent/events.mjs';
/** Output tail lines kept per job (the card shows 3, the panel the rest). */
export declare const ACTIVITY_TAIL_LINES = 30;
/** The output tail of a watched live job is re-read at most this often. */
export declare const ACTIVITY_TAIL_INTERVAL_MS = 1000;
/** The longest subagent output line kept (characters; an ellipsis marks the cut). */
export declare const MAX_OUTPUT_LINE_CHARS = 400;
/** The child-lane event kinds (they carry the delegating call's id). */
export type LaneEvent = AgentEventOf<'assistant.attempt.start' | 'assistant.delta' | 'assistant.message' | 'tool.call' | 'tool.result' | 'tool.progress' | 'tool.output'>;
/** The subagent lane an event belongs to (`parentCallId`), if it is a child-lane event. */
export declare function laneOf(event: AgentEvent): string | undefined;
/** The state slice this projection writes. */
export interface ActivityState {
    rows: ChatRow[];
    subagents: readonly SubagentState[];
    backgroundJobs: readonly BackgroundJobState[];
}
/** Timer seam (tests inject a manual one). */
export interface ActivityTimer {
    set(callback: () => void, ms: number): unknown;
    clear(handle: unknown): void;
}
export interface ActivityDeps {
    rowIds: {
        value: number;
    };
    /** Settlement toasts (absent = silent, e.g. a scratch projection). */
    notify?(text: string, options?: { color?: NotificationItem['color']; timeoutMs?: number }): () => void;
    /** Publish an asynchronous change (an output tail read). */
    emit?(): void;
    /** Read a job's output tail; undefined when the backend cannot. */
    readOutput?(taskId: string): Promise<string> | undefined;
    now?(): number;
    timer?: ActivityTimer;
}
/** Create the projection over one channel state. */
export declare function createActivityProjection(getState: () => ActivityState, deps: ActivityDeps, host: ActivityHost): {
    apply: (event: AgentEvent, replay: boolean) => void;
    reset: () => void;
    dropRows: () => void;
    watchOutput: (id: string) => (() => void);
    dispose(): void;
    /** The subagent a lane or id names, for control requests. */
    subagent(id: string): SubagentState | undefined;
    job(id: string): BackgroundJobState | undefined;
    agentMessages(): readonly AgentMessageView[];
    /** `/agents`: one line per tracked subagent. */
    listLines(): string[];
};
export type ActivityProjection = ReturnType<typeof createActivityProjection>;

export interface ActivityHost {
  t(key: 'subagent-status-failed' | 'jobs-detail-unknown' | 'subagent-none' | 'subagent-running' | 'subagent-unknown' | 'subagent-status-completed' | 'subagent-status-cancelled' | 'subagent-background'): string
  t(key: 'subagent-task-fallback', params: { kind: string }): string
  t(key: 'jobs-toast-completed' | 'jobs-toast-failed' | 'jobs-toast-killed', params: { id: string; label: string; duration: string; detail: string }): string
  t(key: 'subagent-row', params: { mode: string; label: string; activity: string; id: string }): string
  markChannelReadDirty(value: object): void
  timer: ActivityTimer
}
