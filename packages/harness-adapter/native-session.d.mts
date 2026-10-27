// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import type { AgentEvent, AgentEventMeta } from '../protocol/agent/events.mjs';
import type { SessionCapabilities } from '../protocol/agent/capabilities.mjs';
import type { AgentInput, AgentSession, AgentSessionStatus } from '../protocol/agent/session.mjs';

/** Minimal execution port; the native agent still owns scheduling and its inbox. */
export interface NativeSessionAgent<Message> {
  readonly session: { readonly id: unknown; readonly header?: { readonly cwd?: string } };
  readonly status: string;
  cancel(cause: { kind: 'user' }, options?: { keepInbox: boolean }): unknown;
  steer(message: Message): unknown;
  followup(message: Message): unknown;
}
export interface NativeSessionTranslator<Event, Frame> {
  translateEvent(event: Event): readonly AgentEvent[];
  translateFrame(frame: Frame): readonly AgentEvent[];
  translateReplay(events: readonly Event[]): readonly AgentEvent[];
  reset(): void;
  readonly presentCallView: unknown;
  readonly presentResultView: unknown;
}
type Listener = (events: readonly AgentEvent[], meta: AgentEventMeta) => void;
type Disposer = () => void;
type InboxPayload<Agent> = { readonly agent: Agent; readonly message: { readonly id?: unknown } };
/** Event-specific subscriptions keep vendor event types at the host boundary. */
export interface NativeSessionEvents<Agent extends NativeSessionAgent<unknown>, Event, Frame, Chunk> {
  session(listener: (subject: Agent['session'], event: Event) => void): Disposer;
  status(listener: (payload: { agent: Agent; status: AgentSessionStatus }) => void): Disposer;
  disposed(listener: (payload: { agent: Agent }) => void): Disposer;
  inserted(listener: (payload: InboxPayload<Agent>) => void): Disposer;
  claimed(listener: (payload: InboxPayload<Agent>) => void): Disposer;
  discarded(listener: (payload: InboxPayload<Agent>) => void): Disposer;
  assistantStream(listener: (payload: { agent: Agent; frame: Frame }) => void): Disposer;
  llmStream(listener: (options: { purpose?: string; sessionId?: unknown }, next: () => AsyncIterable<Chunk>) => AsyncIterable<Chunk>): Disposer;
}
export interface NativeSessionOptions {
  readonly interactions?: {
    readonly permissions: SessionCapabilities['permissions'];
    readonly questions: SessionCapabilities['questions'];
    requiresAction(): boolean;
    subscribe(listener: Listener): Disposer;
    dispose(): void;
  };
  readonly controls?: {
    readonly capabilities: Pick<SessionCapabilities, 'effort' | 'modes' | 'plan'>;
    dispose(): void;
  };
}
export interface NativeSessionBindings<
  Message extends { readonly id: string },
  Agent extends NativeSessionAgent<Message>,
  Event extends { readonly type: string },
  Frame extends { readonly type: string },
  Chunk,
  Translator extends NativeSessionTranslator<Event, Frame>,
  Native extends object,
> {
  readonly agent: Agent;
  readonly handle?: { dispose(): Promise<void> };
  readonly options?: NativeSessionOptions;
  readonly nativeBase: Native;
  readonly events: NativeSessionEvents<Agent, Event, Frame, Chunk>;
  createCompaction(): { readonly capability?: SessionCapabilities['compact']; dispose(): Promise<void> };
  createTranslator(): Translator;
  createSubagents(createTranslator: () => Translator): { readonly capability?: SessionCapabilities['subagents']; observe(): Disposer; dispose(): void };
  sessionActions(): Omit<SessionCapabilities, 'native'>;
  jobs(): SessionCapabilities['jobs'];
  snapshot(): readonly Event[];
  removePending(clientMessageId: string): boolean;
  messageFor(input: AgentInput): Message;
  observePressure(listener: () => void): Disposer;
  toolOutput(listener: (events: readonly AgentEvent[]) => void): Disposer;
  isTokenDelta(chunk: Chunk): boolean;
  tokenDeltaChars(chunk: Chunk): number;
}
export interface NativeSessionObservers<Event, Translator> {
  readonly kind: 'dsh';
  subscribeRaw(listener: (event: Event) => void): Disposer;
  rawHistory(): readonly Event[];
  translateReplay(events: readonly Event[]): readonly AgentEvent[];
  resetTranslation(): void;
  readonly presentCallView: Translator extends { readonly presentCallView: infer View } ? View : never;
  readonly presentResultView: Translator extends { readonly presentResultView: infer View } ? View : never;
}
export function createNativeSession<
  Message extends { readonly id: string },
  Agent extends NativeSessionAgent<Message>,
  Event extends { readonly type: string },
  Frame extends { readonly type: string },
  Chunk,
  Translator extends NativeSessionTranslator<Event, Frame>,
  Native extends object,
>(bindings: NativeSessionBindings<Message, Agent, Event, Frame, Chunk, Translator, Native>): AgentSession & {
  readonly capabilities: SessionCapabilities & { readonly native: { readonly dsh: Native & NativeSessionObservers<Event, Translator> } };
};
export function isAgentSession(value: unknown): value is AgentSession;
