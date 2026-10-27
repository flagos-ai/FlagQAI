// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
/** Native brands and event construction stay in the host bindings. */
export function createLiveSessionCompatibility({ brandSessionLogOffset, makeInterruptedTurnEnd }) {
  function liveOf(session) {
    if (session === null || typeof session !== 'object') {
      throw new Error('live Session contract violation: session is not an object');
    }
    return session;
  }
  function asNonNegativeInt(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
      ? value
      : undefined;
  }
  /**
  * Snapshot of a live Session log, including any fork-inherited prefix.
  * Reuses upstream's frozen cache when the log has not appended.
  * A missing or non-array snapshot is a live Session contract violation.
  */
  function snapshotLiveSessionEvents(session) {
    const live = liveOf(session);
    if (typeof live.snapshotEvents === 'function') {
      const snap = live.snapshotEvents();
      if (!Array.isArray(snap)) {
        throw new Error('live Session contract violation: snapshotEvents() did not return an array');
      }
      return snap;
    }
    if (Array.isArray(live.events))
      return live.events;
    throw new Error('live Session contract violation: neither snapshotEvents() nor events is available');
  }
  /**
  * Exclusive log offset (`seq = log.length`). Empty log is 0, not -1, and this
  * is not the last event's seq.
  */
  function liveSessionOffset(session) {
    const seq = asNonNegativeInt(liveOf(session).seq);
    if (seq !== undefined)
      return seq;
    return snapshotLiveSessionEvents(session).length;
  }
  function usesIsSeeded(session) {
    return typeof liveOf(session).header?.['isSeeded'] === 'boolean';
  }
  /**
  * Physical/wire `seedLength` for a live Session: present whenever an exact
  * copied/inherited prefix is marked as seeded, independently of whether the
  * header records `parentSession`. Fresh unseeded sessions omit it.
  * `isSeeded: true` without `inheritedEventCount` is an unknown cut — never
  * coerced to 0.
  */
  function liveSessionPhysicalSeedLength(session) {
    const live = liveOf(session);
    const header = live.header;
    if (header !== undefined && typeof header['isSeeded'] === 'boolean') {
      if (header['isSeeded'] !== true)
        return undefined;
      return asNonNegativeInt(live.inheritedEventCount);
    }
    return asNonNegativeInt(header?.['seedLength']);
  }
  /** Listing-shaped fields for overlaying a live Session onto the session tree. */
  function liveSessionListingFields(session) {
    const header = liveOf(session).header ?? {};
    const text = (value) => typeof value === 'string' && value.length > 0 ? value : undefined;
    return {
      id: text(header['id']),
      cwd: text(header['cwd']),
      createdAt: asNonNegativeInt(header['createdAt']),
      parentSession: text(header['parentSession']),
      origin: text(header['origin']),
      delegationDepth: asNonNegativeInt(header['delegationDepth']),
      agentPreset: text(header['agentPreset']),
      seedLength: liveSessionPhysicalSeedLength(session),
    };
  }
  function assertTurnClosed(sliced, boundaryLabel) {
    const lastTurn = sliced.findLast(event => event.type === 'turn/start' || event.type === 'turn/end');
    if (lastTurn?.type === 'turn/start') {
      throw new Error(`fork boundary ${boundaryLabel} ends inside open turn ${String(lastTurn.data.turn)}`);
    }
  }
  /**
  * Copy of the source log through an inclusive event seq. Omitted boundary
  * means the whole log and still rejects an open turn. Never calls
  * `sessions.fork()`.
  */
  function sliceLiveSessionSeed(session, boundary) {
    const events = snapshotLiveSessionEvents(session);
    const offset = liveSessionOffset(session);
    if (events.length !== offset) {
      throw new Error(`live Session contract violation: snapshot length ${events.length} does not match exclusive seq ${offset}`);
    }
    if (boundary === undefined) {
      const sliced = [...events];
      if (sliced.length === 0)
        return sliced;
      assertTurnClosed(sliced, String(offset - 1));
      return sliced;
    }
    if (!Number.isSafeInteger(boundary) || boundary < 0 || Object.is(boundary, -0)) {
      throw new Error(`fork boundary must be a non-negative safe integer, got ${String(boundary)}`);
    }
    if (boundary >= offset) {
      const lastSeq = offset === 0 ? 'none' : String(offset - 1);
      throw new Error(`fork boundary ${boundary} does not exist (last seq: ${lastSeq})`);
    }
    const boundaryEvent = events[boundary];
    if (boundaryEvent === undefined || boundaryEvent.seq !== boundary) {
      throw new Error(`fork boundary ${boundary} does not match a contiguous event seq`);
    }
    const sliced = events.slice(0, boundary + 1);
    assertTurnClosed(sliced, String(boundary));
    return sliced;
  }
  /**
  * Create-time seed ownership fields. Every copied source prefix is inherited
  * state for domain projections, even when `/fork` deliberately omits
  * `parentSession` so the copy is presented as an independent root. The exact
  * cut distinguishes copied history from child-owned events. Not every
  * projection skips inherited events: newer inbox folds restore pending input
  * from them, so rewind must cancel that work through the child's Inbox API.
  * A child snapshot length cannot reliably be used as the cut because
  * construction may append `session/end-seed`.
  */
  function liveSessionSeedMetadata(session, inheritedCount) {
    if (usesIsSeeded(session)) {
      return {
        meta: { isSeeded: true },
        inheritedEventCount: brandSessionLogOffset(inheritedCount),
      };
    }
    return { meta: { seedLength: inheritedCount } };
  }
  /** Close an open turn with the `turn/end` shape a real user cancellation writes. */
  function appendInterruptedTurnEnd(seed, turn) {
    const last = seed[seed.length - 1];
    if (last === undefined)
      return;
    seed.push(makeInterruptedTurnEnd(Number(last.seq) + 1, last.time + 1, turn));
  }
  return { snapshotLiveSessionEvents, liveSessionOffset, liveSessionPhysicalSeedLength, liveSessionListingFields, sliceLiveSessionSeed, liveSessionSeedMetadata, appendInterruptedTurnEnd };
}
