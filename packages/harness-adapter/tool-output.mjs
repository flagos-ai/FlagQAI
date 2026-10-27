// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import { AsyncLocalStorage } from 'node:async_hooks';
/** Observe the native Bash job ring without consuming the model's cursor or
* replacing execution, permission, timeout or cancellation mechanics. */
export function subscribeNativeToolOutput({ jobs, agent, publish, onExecute, now = Date.now }) {
  if (jobs?.events === undefined || jobs.readAt === undefined)
    return () => { };
  const dispatch = new AsyncLocalStorage();
  const calls = new Map();
  let active = true;
  const pull = (id) => {
    const call = calls.get(id);
    if (!active || call === undefined)
      return;
    try {
      const read = jobs.readAt(id, call.offset, agent.id);
      call.offset = read.next;
      const events = [];
      if (read.lossy || read.chunks.some(chunk => chunk.gapBefore))
        events.push({ type: 'tool.output', callId: call.callId, text: '\n[earlier live output omitted by the job ring]\n', time: now() });
      for (const chunk of read.chunks) {
        const text = `${chunk.channel === 'stderr' ? '[stderr]\n' : ''}${chunk.text}`;
        // Bound individual transport frames; the projector owns tail retention.
        for (let at = 0; at < text.length; at += 16384)
          events.push({ type: 'tool.output', callId: call.callId, text: text.slice(at, at + 16384), time: now() });
      }
      if (events.length > 0)
        publish(events);
    }
    catch { /* optional observer must not alter execution or settlement */ }
  };
  const stopEvents = jobs.events.subscribe({ owner: agent.id }, event => {
    if (!active)
      return;
    if (event.type === 'registered') {
      const callId = dispatch.getStore();
      if (callId !== undefined && event.job.owner === agent.id && event.job.kind === 'bash' && calls.size < 256)
        calls.set(event.job.id, { callId, offset: 0 });
    }
    else if (event.type === 'output')
      pull(event.id);
    else if (event.type === 'settled')
      pull(event.job.id);
    else if (event.type === 'removed')
      calls.delete(event.job.id);
  });
  let stopDispatch;
  try {
    stopDispatch = onExecute(async (exec, next) => {
      if (!active || exec.agent !== agent || exec.name.toLowerCase() !== 'bash' || exec.parent !== undefined)
        return next();
      return dispatch.run(String(exec.callId), async () => {
        try {
          return await next();
        }
        finally {
          for (const [id, call] of calls)
            if (call.callId === String(exec.callId))
              calls.delete(id);
        }
      });
    });
  }
  catch (error) {
    stopEvents();
    throw error;
  }
  return () => {
    if (!active)
      return;
    active = false;
    calls.clear();
    dispatch.disable();
    try {
      stopDispatch();
    }
    finally {
      stopEvents();
    }
  };
}
