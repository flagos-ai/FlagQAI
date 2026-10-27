/** Model discovery and switching over native agent/session bindings. */
export function createModelManager(bindings) {
  return {
    commit(session) {
      const route = bindings.commitRoute(session);
      if (route !== undefined && !bindings.selectModel(route.provider, route.model)) {
        throw new Error('Could not persist the default model preference');
      }
    },
    release(session) { bindings.releaseMount(session.ref.sessionId); },
    async list(session) {
      if (session.ref.backendId !== 'dsh') {
        const models = session.capabilities.models;
        return { available: models !== undefined, current: models?.current(), models: await models?.list() ?? [] };
      }
      return {
        available: true,
        current: bindings.currentRoute(session),
        models: (await Promise.all(bindings.listProviders().map(async provider =>
          (await bindings.listModels(provider.id)).map(model => ({ provider: provider.id, id: model.id, label: model.name ?? model.id })),
        ))).flat(),
      };
    },
    async switch(session, ref) {
      if (session.status !== 'idle') throw new Error('Wait for the current turn to finish before switching models');
      if (session.ref.backendId !== 'dsh') {
        const capability = session.capabilities.models;
        if (capability === undefined) throw new Error('This backend does not support model switching');
        const result = await capability.set(ref);
        if (result.kind === 'refused') throw new Error(result.reason);
        return session;
      }
      const provider = ref.provider;
      if (!provider || !(await bindings.listModels(provider)).some(item => item.id === ref.model)) {
        throw new Error('The selected model is not available on this provider');
      }
      const prepared = await bindings.prepare(session);
      const childId = bindings.newSessionId();
      const reservation = await bindings.reserve(childId);
      const route = { provider, model: ref.model };
      let candidate;
      let handle;
      try {
        handle = await bindings.create(session, childId, prepared, route);
        bindings.recordSelection(handle, route);
        candidate = await bindings.wrap(handle, route);
        await bindings.attach(session, childId);
        reservation.settle();
        return candidate;
      } catch (error) {
        // Release every acquired resource, preserving the switch failure even
        // if a native disposer or ledger cleanup fails.
        for (const cleanup of [
          () => candidate === undefined ? handle?.dispose() : candidate.dispose(),
          () => reservation.abandon(),
          () => bindings.releaseMount(childId),
        ]) {
          try { await cleanup(); }
          catch (cleanupError) {
            try { bindings.reportCleanupError(cleanupError); }
            catch { /* Reporting must not interrupt resource cleanup. */ }
          }
        }
        throw error;
      }
    },
  };
}
