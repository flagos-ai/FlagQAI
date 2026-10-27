// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
const SYNC = { replay: false, wake: 'sync' };
const FRAME = { replay: false, wake: 'frame' };
const QUIET = { replay: false, wake: 'none' };
/**
* Wrap a DSH agent (and the handle that owns it, if any) as an
* `AgentSession`. Creating the wrapper acquires nothing: listeners exist only
* while `subscribe`/`subscribeRaw` subscriptions are live, and only `dispose()`
* releases the handle.
*/
export function createNativeSession(bindings) {
  const { agent, handle, options = {} } = bindings;
  const compaction = bindings.createCompaction();
  const translator = bindings.createTranslator();
  const subagents = bindings.createSubagents(bindings.createTranslator);
  let disposed = false;
  let closing;
  /** Inputs this session queued that the inbox has not claimed or discarded. */
  const pending = new Map();
  /**
  * One `session/event` listener per subscription period, shared by raw and
  * translated subscribers. Raw subscribers (the DSH extensions) see each
  * main-session event before the translated batch reaches the projector, and
  * the bus only ever sees one foreground listener. A removed install is
  * inert.
  */
  const rawListeners = new Set();
  const eventListeners = new Set();
  let eventTap;
  const tapEvents = () => {
    if (eventTap !== undefined)
      return;
    let live = true;
    const dispose = bindings.events.session((subject, event) => {
      if (!live || subject !== agent.session)
        return;
      for (const listener of [...rawListeners])
        listener(event);
      for (const listener of [...eventListeners])
        listener(event);
    });
    eventTap = { dispose: () => { live = false; dispose(); } };
  };
  const untapEvents = () => {
    if (rawListeners.size > 0 || eventListeners.size > 0 || eventTap === undefined)
      return;
    const tap = eventTap;
    eventTap = undefined;
    tap.dispose();
  };
  /** Every listener install is owned at once; a throwing unsubscriber does not
  *  stop the rest (the first failure is rethrown after all ran). */
  const disposeAll = (disposers) => {
    let failure;
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      }
      catch (error) {
        failure ??= error;
      }
    }
    if (failure !== undefined)
      throw failure;
  };
  const native = {
    kind: 'dsh',
    ...bindings.nativeBase,
    subscribeRaw(listener) {
      const entry = (event) => listener(event);
      rawListeners.add(entry);
      try {
        tapEvents();
      }
      catch (error) {
        rawListeners.delete(entry);
        throw error;
      }
      return () => {
        rawListeners.delete(entry);
        untapEvents();
      };
    },
    rawHistory: () => bindings.snapshot(),
    translateReplay: (events) => translator.translateReplay(events),
    resetTranslation: () => translator.reset(),
    presentCallView: translator.presentCallView,
    presentResultView: translator.presentResultView,
  };
  const session = {
    get ref() { return { backendId: 'dsh', sessionId: String(agent.session.id) }; },
    get cwd() {
      return agent.session.header?.cwd ?? '';
    },
    get status() {
      if (disposed)
        return 'disposed';
      if (options.interactions?.requiresAction() === true)
        return 'requires-action';
      return agent.status === 'running' ? 'running' : 'idle';
    },
    capabilities: {
      ...options.controls?.capabilities,
      ...bindings.sessionActions(),
      ...(compaction.capability === undefined ? {} : { compact: compaction.capability }),
      subagents: subagents.capability,
      jobs: bindings.jobs(),
      pendingRetraction: {
        remove(clientMessageId) {
          const removed = bindings.removePending(clientMessageId);
          if (removed)
            pending.delete(clientMessageId);
          return removed;
        },
      },
      ...(options.interactions === undefined ? {} : {
        permissions: options.interactions.permissions,
        questions: options.interactions.questions,
      }),
      native: { dsh: native },
    },
    // A throwaway translator: `history()` is a read, so it must neither reset
    // the live translator's frame fence nor leave the replay's open calls in
    // the live open-call ledger. (Adoption seeds still go through
    // `native.translateReplay`, which is a deliberate live reset.)
    history: () => Promise.resolve(bindings.createTranslator().translateReplay(bindings.snapshot())),
    subscribe(listener) {
      // A callback the bus retained past unsubscription (a dispatch already
      // in flight, an ABA rebind) is inert: nothing is translated for it.
      let active = true;
      const disposers = [() => { active = false; }];
      const own = (dispose) => { disposers.push(dispose); };
      try {
        own(subagents.observe());
        own(bindings.observePressure(() => { if (active)
          listener([], SYNC); }));
        own(bindings.toolOutput(events => {
          if (active)
            listener(events, FRAME);
        }));
        if (options.interactions !== undefined)
          own(options.interactions.subscribe(listener));
        own(bindings.events.status(({ agent: subject, status }) => {
          if (!active || subject !== agent)
            return;
          listener([{ type: 'session.status', status }], QUIET);
        }));
        own(bindings.events.disposed(({ agent: subject }) => {
          if (!active || subject !== agent)
            return;
          disposed = true;
          listener([{ type: 'session.status', status: 'disposed' }], QUIET);
        }));
        // Publish the backend's admitted inbox, never a browser-side queue.
        own(bindings.events.inserted(payload => {
          if (!active || payload.agent !== agent || !pending.has(payload.message.id))
            return;
          listener([{ type: 'pending.changed', items: [...pending.values()] }], QUIET);
        }));
        /**
        * The inbox removed one message. Both events retire the pending entry;
        * the channel retires attached context only for a discard.
        * `agent/inbox/claimed` fires while the loop claims the batch, before
        * the resident `agent/pre-step` listener can append the attachment
        * (dsh-agent-loop: `inbox.claim()` → claimed event → `agent/pre-step`).
        */
        const retire = (payload, how) => {
          if (!active || payload.agent !== agent)
            return;
          const messageId = payload.message?.id;
          if (typeof messageId !== 'string')
            return;
          const clientMessageId = pending.get(messageId)?.id ?? messageId;
          pending.delete(messageId);
          const items = [...pending.values()];
          listener([how === 'claimed'
              ? { type: 'pending.changed', items, claimed: [clientMessageId] }
              : { type: 'pending.changed', items, discarded: [clientMessageId] }], QUIET);
        };
        own(bindings.events.claimed(payload => retire(payload, 'claimed')));
        own(bindings.events.discarded(payload => retire(payload, 'discarded')));
        const onEvent = (event) => {
          if (!active)
            return;
          // Legacy per-token chunks arrive as session events; they wake the
          // renderer frame-coalesced like live stream frames.
          listener(translator.translateEvent(event), event.type === 'assistant/chunk' ? FRAME : SYNC);
        };
        eventListeners.add(onEvent);
        own(() => {
          eventListeners.delete(onEvent);
          untapEvents();
        });
        tapEvents();
        // Live streaming (dsh 0.1.5+; older hosts never emit this): per-token
        // chunks are transient attempt frames on this agent-scoped event, and
        // the durable result still arrives through `session/event`. A start
        // frame alone changes nothing visible, so it does not wake the
        // renderer.
        own(bindings.events.assistantStream(({ agent: subject, frame }) => {
          if (!active || subject !== agent)
            return;
          listener(translator.translateFrame(frame), frame.type === 'chunk' ? FRAME : frame.type === 'end' ? SYNC : QUIET);
        }));
        // Live compaction progress. The summarizer is one `ctx.llm.stream()`
        // call, so its chunks are the only sign of work between
        // `compaction/start` and `compaction/end`. dsh-llm tags that call
        // `purpose: 'compaction'`, and a manual compaction runs while the
        // session is idle, so it cannot be mixed up with a turn's stream. Any
        // other purpose or session gets the original iterable back.
        // A summary stream that started while subscribed keeps reporting until
        // it ends; the channel decides what a late report may still touch.
        own(bindings.events.llmStream((options, next) => {
          const stream = next();
          if (!active || options.purpose !== 'compaction')
            return stream;
          if (options.sessionId === undefined || String(options.sessionId) !== String(agent.session.id))
            return stream;
          return (async function* compactionStream() {
            for await (const chunk of stream) {
              if (bindings.isTokenDelta(chunk))
                listener([{ type: 'compaction.progress', outputChars: bindings.tokenDeltaChars(chunk) }], FRAME);
              yield chunk;
            }
          })();
        }));
      }
      catch (error) {
        try {
          disposeAll(disposers);
        }
        catch { /* the install failure stays primary */ }
        throw error;
      }
      return () => disposeAll(disposers);
    },
    // Synchronous by contract for DSH: steer/followup run before this returns,
    // and a synchronous throw reaches the caller synchronously (the input
    // pipeline rolls its bookkeeping back on it).
    submit(input, placement) {
      const message = bindings.messageFor(input);
      const queued = placement === 'steer' ? 'steer' : 'followup';
      pending.set(message.id, { id: input.clientMessageId, text: input.text, placement: queued });
      try {
        if (placement === 'now')
          agent.cancel({ kind: 'user' });
        if (placement === 'steer')
          agent.steer(message);
        else
          agent.followup(message);
      }
      catch (error) {
        pending.delete(message.id);
        throw error;
      }
      return Promise.resolve({ accepted: true });
    },
    cancel(cause) {
      // `user` keeps the queue, so queued/steered inputs run as the next turn.
      // Every other cause drops it: after `interrupt` the channel parks those
      // inputs in a dock and re-delivers nothing until the user sends it, and
      // a switch/dispose never resumes the old queue. keepInbox is only for
      // the user-cancel and normal turn-end paths.
      if (cause === 'user')
        agent.cancel({ kind: 'user' }, { keepInbox: true });
      else
        agent.cancel({ kind: 'user' });
      // The kernel cancel settles its bookkeeping synchronously: the answer
      // is definitive either way (kept ids for a 'user' cancel, an emptied
      // queue otherwise).
      return Promise.resolve({ stillQueued: cause === 'user' ? [...pending.values()].map(item => item.id) : [], outcome: 'confirmed' });
    },
    dispose() {
      if (closing !== undefined) return closing;
      // Revoke every owned resource synchronously; await only settlement.
      // Compaction cancellation must not postpone native handle revocation.
      const completion = Promise.withResolvers();
      closing = completion.promise;
      const settlements = [];
      for (const close of [
        () => options.controls?.dispose(),
        () => subagents.dispose(),
        () => options.interactions?.dispose(),
        () => compaction.dispose(),
        () => handle?.dispose(),
      ]) {
        try { settlements.push(Promise.resolve(close())); }
        catch (error) { settlements.push(Promise.reject(error)); }
      }
      void Promise.allSettled(settlements).then(results => {
        const failed = results.find(result => result.status === 'rejected');
        if (failed) completion.reject(failed.reason);
        else completion.resolve();
      });
      return closing;
    },
  };
  return session;
}

/** Recognize a shared agent session without inspecting a vendor agent. */
export function isAgentSession(value) {
  return typeof value === 'object' && value !== null &&
    typeof value.subscribe === 'function' && typeof value.capabilities === 'object';
}
