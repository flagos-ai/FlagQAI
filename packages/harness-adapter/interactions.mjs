/** Session-isolated interaction routing; native stores remain the protocol authority. */
const SYNC = Object.freeze({ replay: false, wake: "sync" });

export function createInteractionRouter({ createStores }) {
  const entries = new Map();
  const disposers = new Set();
  let closed = false;
  const bind = agentId => {
    if (closed) throw new Error("Headless interaction router is disposed");
    if (entries.has(agentId)) throw new Error(`headless interactions already bind agent "${agentId}"`);
    const { approvals, questions } = createStores(agentId);
    const listeners = new Set()
    let permissionViews = new Map()
    let questionViews = new Map()
    const permissionOutcomes = new Map()
    let disposed = false
    let disposing = false

    const emit = events => {
      if (events.length === 0 || disposed) return
      for (const listener of [...listeners]) listener(events, SYNC)
    }
    const syncPermissions = () => {
      const next = new Map(approvals.pendingViews().map(view => [view.requestId, view]))
      const events = []
      for (const [requestId] of permissionViews) {
        if (!next.has(requestId)) {
          events.push({ type: 'permission.settled', requestId, outcome: permissionOutcomes.get(requestId) ?? 'cancelled' })
          permissionOutcomes.delete(requestId)
        }
      }
      for (const [requestId, request] of next) {
        if (!permissionViews.has(requestId)) events.push({ type: 'permission.request', request })
      }
      permissionViews = next
      emit(events)
    }
    const syncQuestions = () => {
      const next = new Map(questions.pendingViews().map(view => [view.requestId, view]))
      const events = []
      for (const [requestId] of questionViews) {
        if (!next.has(requestId)) events.push({ type: 'question.settled', requestId })
      }
      for (const [requestId, request] of next) {
        if (!questionViews.has(requestId)) events.push({ type: 'question.request', request })
      }
      questionViews = next
      emit(events)
    }
    const unsubscribeApprovals = approvals.subscribe(syncPermissions)
    const unsubscribeQuestions = questions.subscribe(syncQuestions)

    const interactions = {
      permissions: {
        respond(requestId, decision) {
          permissionOutcomes.set(requestId, decision.kind === 'allow-once'
            ? 'allow-once'
            : decision.kind === 'allow-always' ? 'allow-always' : 'rejected')
          try {
            approvals.respond(requestId, decision)
          } catch (error) {
            permissionOutcomes.delete(requestId)
            throw error
          }
        },
        pending: () => approvals.pendingViews(),
      },
      questions: {
        respond: (requestId, answers) => questions.respond(requestId, answers),
        cancel: requestId => questions.cancelRequest(requestId),
      },
      requiresAction: () => approvals.pendingViews().length > 0 || questions.pendingViews().length > 0,
      subscribe(listener) {
        if (disposed) return () => undefined
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      dispose() {
        if (disposed || disposing) return
        disposing = true
        entries.delete(agentId)
        const errors = []
        for (const settle of [() => approvals.settleAll('cancelled'), () => questions.rejectAll()]) {
          try { settle() } catch (error) { errors.push(error) }
        }
        disposed = true
        for (const unsubscribe of [unsubscribeApprovals, unsubscribeQuestions]) {
          try { unsubscribe() } catch (error) { errors.push(error) }
        }
        listeners.clear()
        if (errors.length) throw new AggregateError(errors, 'Failed to close session interactions')
      },
    }
    entries.set(agentId, { approvals, questions, interactions });
    return interactions;
  };
  return {
    bind,
    askQuestion(agentId, request) { return closed ? undefined : entries.get(agentId)?.questions.ask(request); },
    parkApproval(agentId, request) { return closed ? undefined : entries.get(agentId)?.approvals.park(request); },
    addDisposer(dispose) {
      if (closed) { dispose(); return; }
      disposers.add(dispose);
    },
    dispose() {
      if (closed) return;
      closed = true;
      const errors = [];
      for (const entry of [...entries.values()]) {
        try { entry.interactions.dispose(); } catch (error) { errors.push(error); }
      }
      entries.clear();
      for (const dispose of disposers) {
        try { dispose(); } catch (error) { errors.push(error); }
      }
      disposers.clear();
      if (errors.length) throw new AggregateError(errors, "Failed to close headless interactions");
    },
  };
}
