const TRAIN = 'mcp__flagquantum__train_parameters_tool';
const TERMS = ['ZI', 'IZ', 'ZZ', 'XX'];
const hasKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

function json(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

function failedTrainingResponse(value, seen = new Set(), depth = 0) {
  const parsed = json(value?.type === 'text' ? value.text : value);
  if (!parsed || typeof parsed !== 'object' || seen.has(parsed) || depth > 16) return false;
  seen.add(parsed);
  if (!Array.isArray(parsed) && typeof parsed.status === 'string'
    && parsed.status !== 'success' && parsed.status !== 'succeeded') return true;
  return (Array.isArray(parsed) ? parsed : Object.values(parsed))
    .some(child => failedTrainingResponse(child, seen, depth + 1));
}

function trainingResult(value, seen = new Set(), depth = 0) {
  const parsed = json(value);
  if (!parsed || typeof parsed !== 'object' || seen.has(parsed) || depth > 16) return undefined;
  seen.add(parsed);
  if (!Array.isArray(parsed) && parsed.status === 'success'
    && parsed.parameters && Object.hasOwn(parsed, 'final_loss')) return parsed;
  for (const child of Array.isArray(parsed) ? parsed : Object.values(parsed)) {
    const found = trainingResult(child, seen, depth + 1);
    if (found) return found;
  }
}

function supportedInput(event) {
  const args = json(event?.argsJson);
  if (!args || typeof args !== 'object' || args.circuit_format !== 'qir') return undefined;
  const circuit = json(args.circuit);
  if (!Array.isArray(circuit) || circuit.length !== 3
    || !hasKeys(circuit[0], ['name', 'index'])
    || circuit[0]?.name !== 'x' || JSON.stringify(circuit[0].index) !== '[0]'
    || !hasKeys(circuit[1], ['name', 'index', 'parameters'])
    || !hasKeys(circuit[1]?.parameters, ['theta'])
    || !hasKeys(circuit[1]?.parameters?.theta, ['$parameter'])
    || circuit[1]?.name !== 'ry' || JSON.stringify(circuit[1].index) !== '[1]'
    || circuit[1]?.parameters?.theta?.$parameter !== 'theta'
    || !hasKeys(circuit[2], ['name', 'index'])
    || circuit[2]?.name !== 'cx' || JSON.stringify(circuit[2].index) !== '[1,0]') return undefined;
  const coefficients = new Map();
  if (!Array.isArray(args.hamiltonian)) return undefined;
  for (const term of args.hamiltonian) {
    if (!hasKeys(term, ['pauli', 'coefficient']) || !TERMS.includes(term.pauli)
      || coefficients.has(term.pauli) || !Number.isFinite(term.coefficient)) return undefined;
    coefficients.set(term.pauli, term.coefficient);
  }
  if (TERMS.some(term => !coefficients.has(term)) || coefficients.size !== 4) return undefined;
  return Object.fromEntries(TERMS.map(term => [term, coefficients.get(term)]));
}

const empty = (status, reasonCodes = []) => ({
  status, passed: null, method: 'two-qubit-parity-vqe-v1', callId: null,
  computedEnergy: null, exactGroundEnergy: null, energyVariance: null,
  reportedLossDelta: null, reasonCodes,
});

/** Independent, deliberately narrow numerical check of one supported QIR
 * parity ansatz. It reads Harness tool arguments/results, never model prose.
 * This is not molecular-model, chemistry, or full scientific validation. */
export function vqeNumericalEvidence(calls) {
  const call = [...calls.values()].filter(row => row.interface === TRAIN).at(-1);
  if (!call) return empty('not_observed');
  const base = { ...empty('incomplete'), callId: call.callId };
  if (call.status === 'pending') return { ...base, reasonCodes: ['TRAINING_RESULT_PENDING'] };
  if (call.status === 'failed') return { ...base, status: 'failed', passed: false, reasonCodes: ['TRAINING_TOOL_FAILED'] };
  if (failedTrainingResponse(call.result?.content)) {
    return { ...base, status: 'failed', passed: false, reasonCodes: ['TRAINING_RESPONSE_FAILED'] };
  }
  const h = supportedInput(call.event);
  if (!h) return { ...base, status: 'unsupported', reasonCodes: ['UNSUPPORTED_VQE_INPUT'] };
  const result = trainingResult(call.result?.content);
  const theta = result?.parameters?.theta;
  if (!Number.isFinite(theta) || !Number.isFinite(result?.final_loss)) {
    return { ...base, reasonCodes: ['TRAINING_RESULT_INCOMPLETE'] };
  }
  if (Math.abs(theta) > 1e6) return { ...base, reasonCodes: ['ANGLE_OUT_OF_RANGE'] };
  const e01 = h.ZI - h.IZ - h.ZZ;
  const e10 = -h.ZI + h.IZ - h.ZZ;
  const s = Math.sin(theta / 2), c = Math.cos(theta / 2);
  const computedEnergy = e01 * s * s + e10 * c * c + 2 * h.XX * s * c;
  const exactGroundEnergy = Math.min(
    (e01 + e10) / 2 - Math.hypot((e01 - e10) / 2, h.XX),
    h.ZZ - Math.hypot(h.ZI + h.IZ, h.XX),
  );
  const rawVariance =
    (e01 * s + h.XX * c) ** 2 + (h.XX * s + e10 * c) ** 2 - computedEnergy ** 2;
  const energyVariance = Math.max(0, rawVariance);
  const reportedLossDelta = Math.abs(computedEnergy - result.final_loss);
  if (![computedEnergy, exactGroundEnergy, energyVariance, reportedLossDelta].every(Number.isFinite)
    || rawVariance < -1e-8) {
    return { ...base, reasonCodes: ['NUMERICAL_RESULT_NONFINITE'] };
  }
  const reasonCodes = [];
  if (reportedLossDelta > 1e-5) reasonCodes.push('REPORTED_LOSS_MISMATCH');
  if (computedEnergy - exactGroundEnergy > 1e-4) reasonCodes.push('GROUND_ENERGY_NOT_REACHED');
  if (energyVariance > 1e-4) reasonCodes.push('ENERGY_VARIANCE_TOO_HIGH');
  return {
    ...base, status: reasonCodes.length ? 'failed' : 'passed', passed: reasonCodes.length === 0,
    computedEnergy, exactGroundEnergy, energyVariance, reportedLossDelta, reasonCodes,
  };
}
