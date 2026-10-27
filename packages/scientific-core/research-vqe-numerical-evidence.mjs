const EXECUTE = 'mcp__flagquantum__execute_local_capability_tool';
const CAPABILITY = 'ground_state.solve.vqe';
const BUNDLE_SCHEMA = 'flagquantum.research_capability_evidence_bundle.v1';
const TERMS = ['II', 'ZI', 'IZ', 'ZZ', 'XX'];
const METHOD = 'two-qubit-weight-one-research-vqe-v1';

function json(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

function findObject(value, predicate, seen = new Set(), depth = 0) {
  const parsed = json(value?.type === 'text' ? value.text : value);
  if (!parsed || typeof parsed !== 'object' || seen.has(parsed) || depth > 16) return undefined;
  seen.add(parsed);
  if (!Array.isArray(parsed) && predicate(parsed)) return parsed;
  for (const child of Array.isArray(parsed) ? parsed : Object.values(parsed)) {
    const found = findObject(child, predicate, seen, depth + 1);
    if (found) return found;
  }
}

function failedEnvelope(content) {
  const blocks = Array.isArray(content) ? content : [content];
  return blocks.some(block => {
    const response = json(block?.type === 'text' ? block.text : block);
    return response && typeof response === 'object' && !Array.isArray(response)
      && typeof response.status === 'string' && Object.hasOwn(response, 'result')
      && response.status !== 'success' && response.status !== 'succeeded';
  });
}

function supportedInput(event) {
  const args = json(event?.argsJson);
  const request = args?.request;
  const hamiltonian = request?.hamiltonian;
  if (args?.capability_id !== CAPABILITY
    || request?.schema !== 'flagquantum.ground_state_vqe_request.v1'
    || hamiltonian?.schema !== 'flagquantum.pauli_sum.v1'
    || hamiltonian.n_qubits !== 2 || hamiltonian.coefficient_unit !== 'hartree'
    || hamiltonian.basis_convention !== 'wire_0_is_leftmost'
    || request.fixed_hamming_weight !== 1 || !Array.isArray(hamiltonian.terms)
    || hamiltonian.terms.length !== TERMS.length) return undefined;
  const coefficients = new Map();
  for (const term of hamiltonian.terms) {
    if (!term || typeof term !== 'object' || !TERMS.includes(term.pauli)
      || coefficients.has(term.pauli) || !Number.isFinite(term.coefficient)) return undefined;
    coefficients.set(term.pauli, term.coefficient);
  }
  return TERMS.every(term => coefficients.has(term)) ? Object.fromEntries(coefficients) : undefined;
}

function supportedState(bundle) {
  const vector = bundle?.result?.statevector;
  if (!Array.isArray(vector?.basis_states) || !Array.isArray(vector.amplitudes)
    || vector.basis_states.length !== vector.amplitudes.length
    || vector.basis_states.length === 0 || vector.basis_states.length > 4) return undefined;
  const amplitudes = new Map();
  for (let index = 0; index < vector.basis_states.length; index++) {
    const basis = vector.basis_states[index];
    const amplitude = vector.amplitudes[index];
    if (typeof basis !== 'string' || !/^[01]{2}$/.test(basis) || amplitudes.has(basis)
      || !Number.isFinite(amplitude?.real) || !Number.isFinite(amplitude?.imag)) return undefined;
    amplitudes.set(basis, [amplitude.real, amplitude.imag]);
  }
  const norm = [...amplitudes.values()].reduce((sum, [real, imag]) => sum + real ** 2 + imag ** 2, 0);
  const evenWeight = ['00', '11'].reduce((sum, basis) => {
    const [real, imag] = amplitudes.get(basis) ?? [0, 0];
    return sum + real ** 2 + imag ** 2;
  }, 0);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-6 || evenWeight > 1e-10) return undefined;
  return { a01: amplitudes.get('01') ?? [0, 0], a10: amplitudes.get('10') ?? [0, 0],
    oddNorm: norm - evenWeight };
}

const empty = (status, callId = null, reasonCodes = []) => ({
  status, passed: null, method: METHOD, callId,
  computedEnergy: null, exactSectorEnergy: null, energyVariance: null,
  reportedEnergyDelta: null, reasonCodes,
});

/** Recompute one bounded research VQE result from Harness-recorded tool data.
 * This is a numerical check in the requested weight-one sector, not a
 * molecular-model, chemistry, or full scientific verdict. */
export function researchVqeNumericalEvidence(calls) {
  const call = [...calls.values()].filter(row => row.interface === EXECUTE).at(-1);
  if (!call) return empty('not_observed');
  const base = empty('incomplete', call.callId);
  if (call.status === 'pending') return { ...base, reasonCodes: ['EXECUTION_RESULT_PENDING'] };
  if (call.status === 'failed') return { ...base, status: 'failed', passed: false,
    reasonCodes: ['EXECUTION_TOOL_FAILED'] };
  if (failedEnvelope(call.result?.content)) return { ...base, status: 'failed', passed: false,
    reasonCodes: ['EXECUTION_RESPONSE_FAILED'] };
  const h = supportedInput(call.event);
  if (!h) return { ...base, status: 'unsupported', reasonCodes: ['UNSUPPORTED_RESEARCH_INPUT'] };
  const bundle = findObject(call.result?.content, value => value.schema === BUNDLE_SCHEMA);
  if (!bundle) return { ...base, reasonCodes: ['EVIDENCE_BUNDLE_NOT_RETURNED'] };
  if (bundle.status !== 'succeeded') return { ...base, status: 'failed', passed: false,
    reasonCodes: ['EVIDENCE_STATUS_NOT_SUCCEEDED'] };
  if (bundle.capability?.capability_id !== CAPABILITY) return { ...base,
    reasonCodes: ['EVIDENCE_CAPABILITY_MISMATCH'] };
  const state = supportedState(bundle);
  if (!state || !Number.isFinite(bundle.result?.energy)) return { ...base,
    reasonCodes: ['STATEVECTOR_OR_ENERGY_INVALID'] };

  const e01 = h.II + h.ZI - h.IZ - h.ZZ;
  const e10 = h.II - h.ZI + h.IZ - h.ZZ;
  const [aReal, aImag] = state.a01;
  const [bReal, bImag] = state.a10;
  const coupling = h.XX;
  const computedEnergy = (e01 * (aReal ** 2 + aImag ** 2)
    + e10 * (bReal ** 2 + bImag ** 2)
    + 2 * coupling * (aReal * bReal + aImag * bImag)) / state.oddNorm;
  const h01 = [e01 * aReal + coupling * bReal, e01 * aImag + coupling * bImag];
  const h10 = [coupling * aReal + e10 * bReal, coupling * aImag + e10 * bImag];
  const rawVariance = (h01[0] ** 2 + h01[1] ** 2 + h10[0] ** 2 + h10[1] ** 2)
    / state.oddNorm - computedEnergy ** 2;
  const energyVariance = Math.max(0, rawVariance);
  const exactSectorEnergy = (e01 + e10) / 2 - Math.hypot((e01 - e10) / 2, coupling);
  const reportedEnergyDelta = Math.abs(computedEnergy - bundle.result.energy);
  if (![computedEnergy, exactSectorEnergy, energyVariance, reportedEnergyDelta].every(Number.isFinite)
    || rawVariance < -1e-8) return { ...base, reasonCodes: ['NUMERICAL_RESULT_NONFINITE'] };
  const reasonCodes = [];
  if (reportedEnergyDelta > 2e-6) reasonCodes.push('REPORTED_ENERGY_MISMATCH');
  if (computedEnergy - exactSectorEnergy > 2e-5) reasonCodes.push('SECTOR_GROUND_ENERGY_NOT_REACHED');
  if (energyVariance > 1e-5) reasonCodes.push('ENERGY_VARIANCE_TOO_HIGH');
  return { ...base, status: reasonCodes.length ? 'failed' : 'passed',
    passed: reasonCodes.length === 0, computedEnergy, exactSectorEnergy,
    energyVariance, reportedEnergyDelta, reasonCodes };
}
