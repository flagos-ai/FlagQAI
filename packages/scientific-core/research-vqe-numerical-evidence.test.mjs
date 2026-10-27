import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flagQuantumCallEvidence } from './flagquantum-call-evidence.mjs';

function researchEvents() {
  const amplitude = 1 / Math.sqrt(2);
  const request = {
    schema: 'flagquantum.ground_state_vqe_request.v1',
    hamiltonian: {
      schema: 'flagquantum.pauli_sum.v1', n_qubits: 2,
      coefficient_unit: 'hartree', basis_convention: 'wire_0_is_leftmost',
      terms: ['II', 'ZI', 'IZ', 'ZZ', 'XX'].map(pauli => ({
        pauli, coefficient: pauli === 'XX' ? -1 : 0,
      })),
    },
    fixed_hamming_weight: 1,
  };
  const bundle = {
    schema: 'flagquantum.research_capability_evidence_bundle.v1',
    capability: { capability_id: 'ground_state.solve.vqe' }, status: 'succeeded',
    result: { energy: -1, statevector: {
      basis_states: ['01', '10'],
      amplitudes: [{ real: amplitude, imag: 0 }, { real: amplitude, imag: 0 }],
    } },
  };
  return [
    { type: 'tool.call', callId: 'execute', name: 'mcp__flagquantum__execute_local_capability_tool',
      argsJson: JSON.stringify({ capability_id: 'ground_state.solve.vqe', request }) },
    { type: 'tool.result', callId: 'execute', isError: false,
      content: [{ type: 'text', text: JSON.stringify({ status: 'success', result: bundle }) }] },
  ];
}

function changeBundle(events, change) {
  const response = JSON.parse(events[1].content[0].text);
  change(response.result);
  events[1].content[0].text = JSON.stringify(response);
}

test('the runtime independently checks a supported research state and redacts raw data', () => {
  const evidence = flagQuantumCallEvidence(researchEvents());
  const numerical = evidence.researchVqeNumericalEvidence;
  assert.equal(numerical.status, 'passed');
  assert.equal(numerical.passed, true);
  assert.ok(Math.abs(numerical.computedEnergy + 1) < 1e-12);
  assert.ok(Math.abs(numerical.exactSectorEnergy + 1) < 1e-12);
  assert.ok(numerical.energyVariance < 1e-12);
  assert.equal(evidence.scientificResultValidated, null,
    'a sector-level numerical check is not full scientific validation');
  assert.equal(JSON.stringify(evidence).includes('basis_states'), false);
  assert.equal(JSON.stringify(evidence).includes('hamiltonian'), false);
});

test('mismatched reported energy and a non-ground state cannot pass', () => {
  const mismatched = researchEvents();
  changeBundle(mismatched, bundle => { bundle.result.energy = 0; });
  assert.deepEqual(flagQuantumCallEvidence(mismatched).researchVqeNumericalEvidence.reasonCodes,
    ['REPORTED_ENERGY_MISMATCH']);

  const excited = researchEvents();
  changeBundle(excited, bundle => {
    bundle.result.energy = 0;
    bundle.result.statevector = {
      basis_states: ['01'], amplitudes: [{ real: 1, imag: 0 }],
    };
  });
  const verdict = flagQuantumCallEvidence(excited).researchVqeNumericalEvidence;
  assert.equal(verdict.status, 'failed');
  assert.deepEqual(verdict.reasonCodes,
    ['SECTOR_GROUND_ENERGY_NOT_REACHED', 'ENERGY_VARIANCE_TOO_HIGH']);
});

test('unsupported inputs and malformed returned states stay unverified', () => {
  const unsupported = researchEvents();
  const args = JSON.parse(unsupported[0].argsJson);
  args.request.hamiltonian.n_qubits = 3;
  unsupported[0].argsJson = JSON.stringify(args);
  assert.equal(flagQuantumCallEvidence(unsupported).researchVqeNumericalEvidence.status, 'unsupported');

  const invalid = researchEvents();
  changeBundle(invalid, bundle => {
    bundle.result.statevector = {
      basis_states: ['00'], amplitudes: [{ real: 1, imag: 0 }],
    };
  });
  assert.deepEqual(flagQuantumCallEvidence(invalid).researchVqeNumericalEvidence.reasonCodes,
    ['STATEVECTOR_OR_ENERGY_INVALID']);
});

test('rounded normalized amplitudes are accepted but material norm drift is not', () => {
  const rounded = researchEvents();
  changeBundle(rounded, bundle => {
    bundle.result.statevector.amplitudes[0].real *= 1 + 1e-7;
    bundle.result.statevector.amplitudes[1].real *= 1 + 1e-7;
  });
  const roundedVerdict = flagQuantumCallEvidence(rounded).researchVqeNumericalEvidence;
  assert.equal(roundedVerdict.status, 'passed', JSON.stringify(roundedVerdict));
  const drifted = researchEvents();
  changeBundle(drifted, bundle => {
    bundle.result.statevector.amplitudes[0].real *= 1.01;
    bundle.result.statevector.amplitudes[1].real *= 1.01;
  });
  assert.equal(flagQuantumCallEvidence(drifted).researchVqeNumericalEvidence.status, 'incomplete');
});

test('failed transport and failed MCP response are not numerical passes', () => {
  const transport = researchEvents();
  transport[1].isError = true;
  assert.deepEqual(flagQuantumCallEvidence(transport).researchVqeNumericalEvidence.reasonCodes,
    ['EXECUTION_TOOL_FAILED']);

  const response = researchEvents();
  const payload = JSON.parse(response[1].content[0].text);
  payload.status = 'error';
  response[1].content[0].text = JSON.stringify(payload);
  assert.deepEqual(flagQuantumCallEvidence(response).researchVqeNumericalEvidence.reasonCodes,
    ['EXECUTION_RESPONSE_FAILED']);
});
