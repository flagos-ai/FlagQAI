// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
/** Coordinate durable actions through native ports; never own persistence. */
export function createNativeSessionActions({ agent, appendTitle, fork }) {
  return {
    rename: { async rename(title) { appendTitle(agent.session, title); } },
    ...(fork === undefined ? {} : { fork: {
      async fork(anchor, title) {
        if (agent.status === 'running') throw new Error('Wait for the current turn to finish');
        const events = fork.snapshot();
        const seq = anchor === undefined ? undefined : Number(anchor);
        if (seq !== undefined && (!/^\d+$/.test(anchor) || !Number.isSafeInteger(seq) || !events.some(event => event.seq === seq && event.type === 'user/message'))) {
          throw new Error('The selected message is not in this session');
        }
        const target = seq === undefined ? undefined : fork.target(events, seq);
        const seed = target === undefined ? [...fork.seed()] : events.filter(event => event.seq <= target.boundary);
        const closeAfterCreate = target?.closeTurn !== undefined && agent.session.header.version >= 3;
        if (target?.closeTurn !== undefined && !closeAfterCreate) fork.appendInterruptedTurnEnd(seed, target.closeTurn);
        const composed = await fork.compose();
        const id = fork.createId();
        const { reservation } = await fork.reserve(String(id));
        let handle;
        try {
          handle = await fork.create({
            sessionId: id, seed, inheritedCount: seed.length, runtimeSession: agent.session,
            cwd: agent.session.header.cwd ?? '', parentSession: anchor === undefined ? undefined : agent.session.id,
            composed, closeTurn: closeAfterCreate ? target.closeTurn : undefined,
          });
          fork.recordModelSelection(handle.agent.session);
          if (title !== undefined) appendTitle(handle.agent.session, title);
          await fork.attach(agent.session.header.cwd ?? '', id);
          return { backendId: 'dsh', sessionId: String(id) };
        } finally {
          try { await handle?.dispose(); } finally { reservation.abandon(); fork.release(String(id)); }
        }
      },
    } }),
  };
}
