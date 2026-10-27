// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
/** Own the native manual transaction; never synthesize a checkpoint or agent loop. */
export function createNativeCompaction({ agent, service, decide }) {
  let disposed = false;
  let active;
  return {
    capability: typeof service?.compactNow !== 'function' ? undefined : {
      async run() {
        if (disposed || active !== undefined || agent.status === 'running')
          throw new Error('Session is unavailable or busy');
        const controller = new AbortController();
        const settled = (async () => {
          const decision = await decide({
            sessionId: String(agent.session.id), cwd: agent.session.header.cwd ?? '',
          });
          if (decision !== undefined)
            throw new Error('Compaction was declined by an extension');
          if (disposed || controller.signal.aborted || agent.status === 'running')
            throw new Error('Session changed before compaction');
          return { compacted: (await service.compactNow(agent, controller.signal)) != null };
        })();
        active = { controller, settled };
        try {
          return await settled;
        }
        finally {
          active = undefined;
        }
      },
    },
    async dispose() {
      disposed = true;
      const transaction = active;
      if (transaction === undefined)
        return;
      transaction.controller.abort(new Error('Session disposed'));
      await transaction.settled.catch(() => undefined);
    },
  };
}
