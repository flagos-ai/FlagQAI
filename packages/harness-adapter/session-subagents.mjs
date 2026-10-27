// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
/** Observe native lifecycle edges; never create, resume or schedule a child. */
export function createNativeSubagentsCapability(bindings) {
  const { agent, createTranslator, readChildTranscriptPage } = bindings;
  const service = bindings.service;
  const lookupChild = bindings.lookupChild;
  const parentSessionId = String(agent.session.id);
  const capture = { sessionId: parentSessionId, generation: 0, session: agent.session };
  const controller = new AbortController();
  const states = new Map();
  const owns = async (id) => (await service()?.listChildren?.(parentSessionId, controller.signal))?.some(child => child.id === id) === true;
  const capability = service()?.listChildren === undefined ? undefined : {
    async list() {
      controller.signal.throwIfAborted();
      const roster = await service().listChildren(parentSessionId, controller.signal);
      controller.signal.throwIfAborted();
      return roster.slice(-100).map(child => {
        const live = lookupChild(child.id);
        const state = states.get(child.id);
        return { id: child.id, parentSessionId, description: (child.label ?? 'Subagent task').slice(0, 2048), mode: child.mode,
          status: live?.status === 'running' ? 'running' : state?.status ?? 'unknown',
          createdAt: child.createdAt,
          ...(live?.options?.model === undefined ? {} : { model: live.options.model }),
          ...(state?.summary === undefined ? {} : { summary: state.summary }), };
      });
    },
    async interrupt(id) {
      if (!await owns(id) || service()?.interrupt === undefined)
        return false;
      service().interrupt(id, { kind: 'ancestor', agent });
      return true;
    },
    ...(bindings.persistence() === undefined ? {} : { async history(id, window) {
        const page = await readChildTranscriptPage({
          capture: () => controller.signal.aborted ? undefined : capture,
          isCurrent: value => value === capture && !controller.signal.aborted,
          subagents: service,
          persistence: bindings.persistence,
          sessionsStore: bindings.sessionsStore,
          lookupChild, createTranslator, ownerSignal: controller.signal,
        }, id, window);
        if (page === null)
          throw new Error('Subagent is not a direct child of this session');
        return page;
      } }),
  };
  return {
    capability,
    observe() {
      if (capability === undefined)
        return () => { };
      let active = true;
      const start = bindings.onStart((function (run) {
        if (!active || controller.signal.aborted || bindings.carrierKeyOf(this) !== agent)
          return;
        states.delete(run.id);
        states.set(run.id, { runId: run.runId, status: 'running' });
        if (states.size > 100)
          states.delete(states.keys().next().value);
      }));
      let end;
      try {
        end = bindings.onEnd((function (run) {
          if (!active || controller.signal.aborted || bindings.carrierKeyOf(this) !== agent)
            return;
          const prior = states.get(run.id);
          if (!prior || (run.runId !== undefined && prior.runId !== run.runId))
            return;
          states.set(run.id, { runId: run.runId,
            status: run.stopReason === 'completed' ? 'completed' : ['cancelled', 'aborted'].includes(run.stopReason ?? '') ? 'cancelled' : 'failed',
            summary: run.lastAssistantMessage?.map(block => typeof block.text === 'string' ? block.text : '').join('\n').slice(-4096),
          });
        }));
      }
      catch (error) {
        start();
        throw error;
      }
      return () => { active = false; try {
        start();
      }
      finally {
        end();
      } };
    },
    dispose() { controller.abort(); states.clear(); },
  };
}
