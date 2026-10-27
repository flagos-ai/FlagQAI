// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import type { AgentEvent, ContentBlockView } from '../protocol/agent/events.mjs';
import type { TodoPanelItem, TranscriptImage, ToolCallView, ToolResultView } from '../protocol/agent/channel-view.mjs';
export interface NativeTranslationRecord {
  readonly type: string; readonly seq: number; readonly time: number; readonly data: unknown;
}
export interface NativeTranslationFrame {
  readonly type: string; readonly revision: number; readonly attemptId: string;
}
export interface NativeTranslatorTools {
  get(name: string, scope?: unknown): {
    presentCall?(args: unknown): unknown;
    presentResult?(args: unknown, result: unknown): unknown;
  } | undefined;
}
/** Types remain native to the embedding host; these ports bind its log schema
 * compatibility, replay filtering, and lazy attachment/presenter services. */
export interface NativeTranslatorBindings<Event, Frame, Block extends ContentBlockView, Source, Message, ToolData> {
  tools(): NativeTranslatorTools | undefined;
  scope(): unknown;
  attachments(): unknown;
  BACKGROUND_START_ACK: RegExp;
  isSubagentToolName(name: string): boolean;
  parseJobOutputId(args: string): string | undefined;
  todoPanelItems(data: unknown): TodoPanelItem[] | undefined;
  toolCommandOf(args: string): string | undefined;
  harnessToolResultView(name: string, data: ToolData): ToolResultView | undefined;
  prepareReplayEvents(events: readonly Event[]): readonly Event[];
  toolErrorText(event: Extract<Event, { type: 'tool/result' }>): string;
  isCompactionCheckpointSource(source: Source): boolean;
  toolResultPayload(message: Message): { content: readonly Block[]; isError: boolean };
  transcriptImagesOf(content: readonly Block[] | undefined, attachments: () => unknown): readonly TranscriptImage[];
}
export interface NativeTranslator<Event, Frame, ToolData> {
  translateEvent(event: Event): readonly AgentEvent[];
  translateFrame(frame: Frame): readonly AgentEvent[];
  translateReplay(events: readonly Event[]): readonly AgentEvent[];
  reset(): void;
  presentCallView(name: string, rawArgs: string): ToolCallView | undefined;
  presentResultView(name: string, rawArgs: string, data: ToolData): ToolResultView | undefined;
}
/** Translates already-decoded native DSH records, not untrusted wire JSON.
 * Frame revision fences and open calls are scoped to this translator instance. */
export function createNativeTranslator<Event extends NativeTranslationRecord, Frame extends NativeTranslationFrame, Block extends ContentBlockView, Source, Message, ToolData>(
  bindings: NativeTranslatorBindings<Event, Frame, Block, Source, Message, ToolData>,
): NativeTranslator<Event, Frame, ToolData>;
