/** Read-only telemetry from the durable backend-owned event history. The
 * model cannot add counters or timestamps by writing a response/artifact. */
const timestamp = value => Number.isFinite(value) && value >= 0 && value <= 8.64e15
  ? new Date(value).toISOString() : null;
const END_REASONS = new Set(['completed', 'aborted', 'interrupted', 'error', 'blocked', 'other']);

export function sessionTelemetry(events, runId, permissionEvidence) {
  if (!Array.isArray(events) || typeof runId !== 'string' || runId.length === 0) {
    throw new TypeError('Complete session events and a run ID are required');
  }
  const records = [];
  const calls = new Map();
  let previousTime = null;
  let clockOrderValid = true;
  let timestampsComplete = true;
  for (const [index, event] of events.entries()) {
    if (!event || typeof event !== 'object') continue;
    let record;
    switch (event.type) {
      case 'turn.start':
        record = { stage: 'execution', eventType: 'turn_start', turn: Number.isInteger(event.turn) ? event.turn : null };
        break;
      case 'turn.end':
        record = { stage: 'execution', eventType: 'turn_end', turn: Number.isInteger(event.turn) ? event.turn : null,
          reason: END_REASONS.has(event.reason?.kind) ? event.reason.kind : null };
        break;
      case 'tool.call':
        if (typeof event.callId !== 'string' || typeof event.name !== 'string') break;
        record = { stage: 'execution', eventType: 'tool_call', callId: event.callId, toolName: event.name };
        if (!calls.has(event.callId)) calls.set(event.callId, { toolName: event.name, startTime: event.time, status: 'pending' });
        break;
      case 'tool.result': {
        if (typeof event.callId !== 'string') break;
        const call = calls.get(event.callId);
        if (!call || call.status !== 'pending') break;
        call.status = event.isError === true ? 'failed' : 'returned';
        call.endTime = event.time;
        record = { stage: 'execution', eventType: 'tool_result', callId: event.callId,
          toolName: call.toolName, status: call.status,
          durationSeconds: Number.isFinite(call.startTime) && Number.isFinite(event.time) && event.time >= call.startTime
            ? (event.time - call.startTime) / 1000 : null };
        break;
      }
      default:
        break;
    }
    if (!record) continue;
    const time = timestamp(event.time);
    if (time === null) timestampsComplete = false;
    else if (previousTime !== null && event.time < previousTime) clockOrderValid = false;
    if (time !== null) previousTime = event.time;
    records.push({ eventId: index + 1, runId, ...record, time });
  }
  const values = [...calls.values()];
  const decisions = permissionEvidence?.decisions;
  const permissionOutcomes = Array.isArray(decisions)
    ? decisions.filter(decision => ['allow-once', 'allow-always', 'rejected'].includes(decision.outcome))
      .map(decision => decision.outcome) : [];
  return {
    schemaVersion: 1,
    source: permissionEvidence ? 'backend-session-history+permission-journal' : 'backend-session-history',
    runId,
    permissionSessionKey: permissionEvidence?.sessionKey ?? null,
    // These untimed outcomes are deliberately separate from chronological
    // backend events; their relative order cannot be reconstructed.
    permissionOutcomes,
    clockOrderValid,
    timestampsComplete,
    counts: {
      toolCalls: values.length,
      toolReturned: values.filter(call => call.status === 'returned').length,
      toolFailed: values.filter(call => call.status === 'failed').length,
      toolPending: values.filter(call => call.status === 'pending').length,
      // A complete local journal can prove zero; missing, legacy, interrupted,
      // or unreadable evidence must remain unknown.
      permissionDecisions: permissionEvidence?.complete === true && Array.isArray(decisions)
        && permissionOutcomes.length === decisions.length ? decisions.length : null,
      scientificInterventions: null,
    },
    // A tool return is a transport observation, not validated scientific output.
    scientificResultValidated: null,
    events: records,
  };
}
