/** Structural ports implemented by native approval and question stores. */
export interface InteractionStores {
  approvals: {
    pendingViews(): readonly { requestId: string }[];
    subscribe(listener: () => void): () => void;
    respond(requestId: string, decision: never): void;
    park(request: never): Promise<unknown>;
    settleAll(outcome: 'cancelled'): void;
  };
  questions: {
    pendingViews(): readonly { requestId: string }[];
    subscribe(listener: () => void): () => void;
    respond(requestId: string, answers: never): void;
    ask(request: never): Promise<unknown>;
    cancelRequest(requestId: string): void;
    rejectAll(): void;
  };
}
export type InteractionEvent<S extends InteractionStores> =
  | { type: 'permission.request'; request: ReturnType<S['approvals']['pendingViews']>[number] }
  | { type: 'permission.settled'; requestId: string; outcome: 'allow-once' | 'allow-always' | 'rejected' | 'cancelled' }
  | { type: 'question.request'; request: ReturnType<S['questions']['pendingViews']>[number] }
  | { type: 'question.settled'; requestId: string };
export interface SessionInteractions<S extends InteractionStores> {
  permissions: {
    respond(requestId: string, decision: Parameters<S['approvals']['respond']>[1]): void;
    pending(): ReturnType<S['approvals']['pendingViews']>;
  };
  questions: {
    respond(requestId: string, answers: Parameters<S['questions']['respond']>[1]): void;
    cancel(requestId: string): void;
  };
  requiresAction(): boolean;
  subscribe(listener: (events: readonly InteractionEvent<S>[], meta: { replay: false; wake: 'sync' }) => void): () => void;
  dispose(): void;
}
export function createInteractionRouter<S extends InteractionStores>(options: {
  createStores(agentId: string): S;
}): {
  bind(agentId: string): SessionInteractions<S>;
  askQuestion(agentId: string, request: Parameters<S['questions']['ask']>[0]): ReturnType<S['questions']['ask']> | undefined;
  parkApproval(agentId: string, request: Parameters<S['approvals']['park']>[0]): ReturnType<S['approvals']['park']> | undefined;
  addDisposer(dispose: () => void): void;
  dispose(): void;
};
