import { vqeNumericalEvidence } from './vqe-numerical-evidence.mjs';
import { researchVqeNumericalEvidence } from './research-vqe-numerical-evidence.mjs';

const EXECUTE_RESEARCH = 'mcp__flagquantum__execute_local_capability_tool';
const VALIDATE_EVIDENCE = 'mcp__flagquantum__validate_evidence_tool';
const EVIDENCE_SCHEMA = 'flagquantum.research_capability_evidence_bundle.v1';

function parsedJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

function findObject(value, predicate, seen = new Set()) {
  const parsed = parsedJson(value);
  if (parsed === undefined || parsed === null || typeof parsed !== 'object') return undefined;
  if (seen.has(parsed)) return undefined;
  seen.add(parsed);
  if (!Array.isArray(parsed) && predicate(parsed)) return parsed;
  for (const nested of Array.isArray(parsed) ? parsed : Object.values(parsed)) {
    const found = findObject(nested, predicate, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

function toolArguments(event) {
  const parsed = parsedJson(event?.argsJson);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
}

function failedResponseEnvelope(result) {
  const content = result?.content;
  const blocks = Array.isArray(content) ? content : [content];
  return blocks.some(block => {
    const response = parsedJson(block?.type === 'text' ? block.text : block);
    return response && typeof response === 'object' && !Array.isArray(response)
      && typeof response.status === 'string' && Object.hasOwn(response, 'result')
      && response.status !== 'success' && response.status !== 'succeeded';
  });
}

function researchValidatorEvidence(callRows, calls) {
  const executions = callRows.filter(row => row.interface === EXECUTE_RESEARCH);
  if (executions.length === 0) return {
    status: 'not_observed', passed: null, capabilityId: null,
    evidenceStatus: null, requiredValidators: [], passedValidators: [], failedValidators: [], reasonCodes: [],
  };
  const execution = executions.at(-1);
  const evidence = findObject(calls.get(execution.callId)?.result?.content,
    value => value.schema === EVIDENCE_SCHEMA);
  const executionFailed = execution.status === 'failed'
    || failedResponseEnvelope(calls.get(execution.callId)?.result);
  if (execution.status !== 'returned' || executionFailed || evidence === undefined) return {
    status: executionFailed ? 'failed' : 'incomplete',
    passed: executionFailed ? false : null,
    capabilityId: null, evidenceStatus: null, requiredValidators: [],
    passedValidators: [], failedValidators: [], reasonCodes: [execution.status === 'failed'
      ? 'EXECUTION_TOOL_FAILED' : executionFailed
        ? 'EXECUTION_RESPONSE_FAILED' : 'EVIDENCE_BUNDLE_NOT_RETURNED'],
  };

  const validation = Array.isArray(evidence.validation) ? evidence.validation : [];
  const requiredValidators = validation
    .map(report => report?.validator_id)
    .filter(id => typeof id === 'string');
  const embeddedFailed = validation.some(report => report?.passed !== true);
  const digest = evidence.provenance?.content_sha256;
  const passedValidators = [];
  const failedValidators = [];
  for (const row of callRows) {
    // Matching content alone is insufficient: a repeated execution can
    // produce the same digest as an earlier run. Only validation requested
    // after this execution returned belongs to its evidence bundle.
    if (row.interface !== VALIDATE_EVIDENCE
      || row.eventIndex <= execution.resultIndex) continue;
    const call = calls.get(row.callId);
    const args = toolArguments(call?.event);
    if (typeof digest !== 'string' || args?.evidence?.provenance?.content_sha256 !== digest) continue;
    if (!requiredValidators.includes(args.validator_id)) continue;
    if (row.status === 'failed') {
      failedValidators.push(args.validator_id);
      continue;
    }
    if (row.status !== 'returned') continue;
    const report = findObject(call?.result?.content,
      value => typeof value.validator_id === 'string' && typeof value.passed === 'boolean');
    // A validator's response must match the requested validator as well as
    // the executed bundle. A different report cannot satisfy this request.
    if (report?.validator_id !== args.validator_id) continue;
    if (failedResponseEnvelope(call.result)) failedValidators.push(report.validator_id);
    else if (report.passed === true) passedValidators.push(report.validator_id);
    else failedValidators.push(report.validator_id);
  }
  const uniquePassed = [...new Set(passedValidators)];
  const uniqueFailed = [...new Set(failedValidators)];
  const missing = requiredValidators.filter(id => !uniquePassed.includes(id));
  const capabilityId = typeof evidence.capability?.capability_id === 'string'
    ? evidence.capability.capability_id : null;
  if (evidence.status !== 'succeeded' || embeddedFailed) return {
    status: 'failed', passed: false, capabilityId, evidenceStatus: evidence.status ?? null,
    requiredValidators, passedValidators: uniquePassed, failedValidators: uniqueFailed,
    reasonCodes: [evidence.status !== 'succeeded'
      ? 'EVIDENCE_STATUS_NOT_SUCCEEDED' : 'EMBEDDED_VALIDATION_FAILED'],
  };
  if (uniqueFailed.length > 0) return {
    status: 'failed', passed: false, capabilityId, evidenceStatus: evidence.status,
    requiredValidators, passedValidators: uniquePassed, failedValidators: uniqueFailed,
    reasonCodes: ['EVIDENCE_VALIDATOR_FAILED'],
  };
  if (requiredValidators.length === 0 || missing.length > 0) return {
    status: 'incomplete', passed: null, capabilityId, evidenceStatus: evidence.status,
    requiredValidators, passedValidators: uniquePassed, failedValidators: uniqueFailed,
    reasonCodes: requiredValidators.length === 0
      ? ['NO_MANDATORY_VALIDATORS_RECORDED'] : ['EVIDENCE_VALIDATION_NOT_OBSERVED'],
  };
  return {
    status: 'passed', passed: true, capabilityId, evidenceStatus: evidence.status,
    requiredValidators, passedValidators: uniquePassed, failedValidators: uniqueFailed, reasonCodes: [],
  };
}

/** Read-only evidence from the Harness-owned session log. No model-authored
 * text, artifact, or self-reported counter is consulted. */
export function flagQuantumCallEvidence(events) {
  const calls = new Map();
  for (const [eventIndex, event] of events.entries()) {
    if (event?.type === 'tool.call' && typeof event.name === 'string'
      && event.name.startsWith('mcp__flagquantum__') && typeof event.callId === 'string') {
      if (!calls.has(event.callId)) calls.set(event.callId, {
        callId: event.callId, interface: event.name, startTime: event.time ?? null,
        status: 'pending', endTime: null, durationSeconds: null,
        eventIndex, resultIndex: null, event, result: null,
      });
    } else if (event?.type === 'tool.result' && typeof event.callId === 'string') {
      const call = calls.get(event.callId);
      if (call === undefined || call.status !== 'pending') continue;
      call.status = event.isError === true ? 'failed' : 'returned';
      call.result = event;
      call.resultIndex = eventIndex;
      call.endTime = event.time ?? null;
      if (typeof call.startTime === 'number' && typeof event.time === 'number') {
        call.durationSeconds = Math.max(0, event.time - call.startTime) / 1000;
      }
    }
  }
  const rows = [...calls.values()];
  const validatorEvidence = researchValidatorEvidence(rows, calls);
  return {
    source: 'harness-session-events',
    toolUseObserved: rows.length > 0,
    interfacesUsed: [...new Set(rows.map(call => call.interface))],
    callsTotal: rows.length,
    callsReturned: rows.filter(call => call.status === 'returned').length,
    callsFailed: rows.filter(call => call.status === 'failed').length,
    callsPending: rows.filter(call => call.status === 'pending').length,
    // A transport return does not prove valid scientific output or that the
    // tool was used as the primary solver. Those require separate acceptance.
    // MCP validator reports establish what FlagQuantum returned, not an
    // independent scientific verdict from the FlagQAI runtime.
    scientificResultValidated: null,
    // This checks only a supported two-qubit parity ansatz against the
    // Hamiltonian sent to the trainer. It is not a chemistry-level verdict.
    vqeNumericalEvidence: vqeNumericalEvidence(calls),
    researchVqeNumericalEvidence: researchVqeNumericalEvidence(calls),
    researchValidatorEvidence: validatorEvidence,
    calls: rows.map(({ event: _event, result: _result, eventIndex: _eventIndex,
      resultIndex: _resultIndex, ...call }) => call),
  };
}
