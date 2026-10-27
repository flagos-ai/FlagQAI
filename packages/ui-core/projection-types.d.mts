// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
import type { TokenUsage, SessionCostByModel, ChannelGoal, ChannelCostReport, CompactionStatus, NotificationItem, TurnUsageSummary } from '../protocol/agent/channel-view.mjs';
type SpinnerMode = 'requesting' | 'thinking' | 'responding' | 'tool-use' | 'tool-input';
/**
 * The shared reducer (docs/agent-backend-design.md): Agent Domain events in,
 * `ChannelState` mutations out, for every backend and for durable replay and
 * the live stream alike. Decoding a backend's native events is not done here:
 * a translator (`src/dsh-adapter/backend/translate.ts` for DSH) produces the
 * `AgentEvent`s; this module only folds them.
 *
 * The DSH projection goldens (`scripts/fixtures/dsh/*.golden.json`) pin its
 * behaviour: attempt start/discard/revive, `seq` idempotency, legacy
 * overlapping-prefix delta merge, thinking preview/full folding, TPS
 * turn/step accounting, token/cost bucketing, compaction context reset,
 * goal/todo/preset/title/colour, question/subagent card suppression and the
 * plugin renderer seam. The order of wall-clock reads is part of that
 * contract (the goldens pin `startedAt`/`durationMs` with a stepping clock).
 */
import type { ChatRow, SelectionAttachment, TodoPanelItem } from '../protocol/agent/channel-view.mjs';
import type { AgentEvent, AgentEventMeta, ContentBlockView } from '../protocol/agent/events.mjs';
import { type PricingWindow } from './usage.mjs';
/** The channel state slice the projector writes. */
export interface ProjectionState {
    thinkingFold: 'preview' | 'full';
    activeToolCount: number;
    spinnerMode: SpinnerMode;
    goal: ChannelGoal | undefined;
    contextSegments: {
    system: number
    prompt: number
    assistant: number
    thinking: number
    tools: number
  };
    tokens: TokenUsage;
    mainCost: SessionCostByModel;
    model: string;
    lastUsage: | { input: number; output: number; cacheRead: number; cacheWrite: number; at: number }
    | undefined;
    turnUsage: TurnUsageSummary | undefined;
    lastUserText: string;
    responseChars: number;
    tps: number | undefined;
    cancelPending: boolean;
    working: boolean;
    compaction: CompactionStatus | undefined;
    turnStart: number;
    contextWindow: number | undefined;
    reasoningEffort: string | undefined;
    sessionTitle: string;
    agentPreset: string | undefined;
    sessionColor: string;
    costReport: ChannelCostReport | undefined;
    rows: ChatRow[];
    tpsSamples: {
        tps: number;
        at: number;
    }[];
    todos: TodoPanelItem[];
}
/** Plugin custom-entry renderer (tuiRenderers seam), structurally. */
export interface ProjectionRenderer {
    render(type: string, data: unknown): {
        readonly title?: string;
        readonly lines: readonly unknown[];
    } | undefined;
}
/** Everything the projector needs from its channel. */
export interface ChannelProjectionDeps {
    rowIds: {
        value: number;
    };
    /** Display name of the bound backend; absent keeps the legacy DSH wording. */
    backendLabel?: () => string | undefined;
    resetContextWarning(): void;
    checkContextWarning(): void;
    notify(text: string, options?: { color?: NotificationItem['color']; timeoutMs?: number }): () => void;
    /** Background-job registry feed (DSH `jobs` service mirror). */
    jobs: {
        onOutputSeen(id: string, text: string, at?: number): void;
        onStarted(id: string, command: string): void;
    };
    /**
     * The backend-neutral subagent / background-task projection
     * (`./activity.ts`): every `subagent.*` / `task.*` / `tasks.snapshot` event
     * and every child-lane event (`parentCallId` set) is handed to it in stream
     * order, so its transcript cards land where the delegation happened. Child-
     * lane events never reach the main transcript. Absent (a DSH composition,
     * whose specialists own these facts) = nothing is forwarded.
     */
    activity?: {
        apply(event: AgentEvent, replaying: boolean): void;
    };
    /**
     * The core's trajectory fold: every event in stream order, child-lane
     * ones included (their subagent lifecycle still maps onto the parent's
     * ledger), feeds the neutral raw-event source behind `traceEvents()`.
     * Absent (a DSH composition, whose raw history is the source) = nothing
     * is forwarded.
     */
    trajectory?: {
        observe(event: AgentEvent, replaying: boolean): void;
    };
    inputConvergence: {
        cancelInFlight: boolean;
    };
    renderer?: ProjectionRenderer;
    /** What a submitted message's IDE selection attached (keyed by the message
     *  id the durable event carries), for the user row's indicator line. */
    selectionAttached(messageId: string): SelectionAttachment | undefined;
    /**
     * Rate window a usage at `time` bills under. Injected by the backend that
     * owns the pricing policy (DSH: the DeepSeek peak hours); absent → every
     * usage lands in the `idle` bucket.
     */
    pricingWindow?: (time: number) => PricingWindow;
}


export interface QuestionRecordQuestion {
    readonly question: string;
    /** A secret question (`QuestionItemView.secret`): its answer is masked. */
    readonly secret?: boolean;
}
/**
 * One answer as the harness persists it (a subset of
 * `AskUserQuestionAnswerItem`: the fold matches answers to questions BY ORDER,
 * mirroring how the panel collects one answer per question).
 */
export interface QuestionRecordAnswer {
    readonly selected: readonly string[];
    readonly custom?: string;
}
/** One answered questionnaire as the transcript renders it. */
export interface QuestionRecord {
    /** Local-row title (dictionary text, never hand-written here). */
    readonly title: string;
    /** One `· question → answer` line per answered question. */
    readonly lines: readonly string[];
}

export interface ProjectionHost {
  t(key: 'compact-done' | 'interrupted-by-user' | 'interrupted-ask-next'): string;
  t(key: 'transcript-image-message', params: { count: number }): string;
  t(key: 'interrupted-ask-backend', params: { name: string }): string;
  t(key: 'turn-failed', params: { detail: string }): string;
  t(key: 'agent-preset-switched', params: { preset: string }): string;
  markChannelReadDirty(target: object): void;
  logForDebugging(message: string): void;
  cleanRenderText(value: string, maxCells: number): string;
  buildQuestionRecord(questions: readonly (QuestionRecordQuestion | undefined)[] | undefined, answers: readonly (QuestionRecordAnswer | undefined)[] | undefined, options?: { redact?: boolean }): QuestionRecord;
  parseQuestionRecordAnswers(rawResult: string): QuestionRecordAnswer[] | undefined;
  parseQuestionRecordQuestions(rawArguments: string | undefined): QuestionRecordQuestion[] | undefined;
}
