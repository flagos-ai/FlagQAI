import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flagQuantumCallEvidence } from './flagquantum-call-evidence.mjs';

test('a scientifically plausible answer without tool calls has no FlagQuantum evidence', () => {
  const evidence = flagQuantumCallEvidence([
    { type: 'assistant.message', text: 'I used FlagQuantum and solved VQE.' },
    { type: 'tool.call', name: 'bash', callId: 'other', time: 100 },
  ]);
  assert.equal(evidence.toolUseObserved, false);
  assert.equal(evidence.callsTotal, 0);
  assert.equal(evidence.scientificResultValidated, null);
  assert.equal(evidence.vqeNumericalEvidence.status, 'not_observed');
  assert.equal(evidence.researchValidatorEvidence.status, 'not_observed');
});

function vqeEvents({ theta = Math.PI / 2, loss = -1, failed = false, circuit, hamiltonian } = {}) {
  const input = {
    circuit_format: 'qir',
    circuit: circuit ?? JSON.stringify([
      { name: 'x', index: [0] },
      { name: 'ry', index: [1], parameters: { theta: { $parameter: 'theta' } } },
      { name: 'cx', index: [1, 0] },
    ]),
    hamiltonian: hamiltonian ?? [
      { pauli: 'ZI', coefficient: 0 }, { pauli: 'IZ', coefficient: 0 },
      { pauli: 'ZZ', coefficient: 0 }, { pauli: 'XX', coefficient: -1 },
    ],
  };
  return [
    { type: 'tool.call', name: 'mcp__flagquantum__train_parameters_tool', callId: 'train', argsJson: JSON.stringify(input) },
    { type: 'tool.result', callId: 'train', isError: failed,
      content: [{ type: 'text', text: JSON.stringify({ result: { status: 'success', parameters: { theta }, final_loss: loss } }) }] },
  ];
}

test('supported VQE result gets a narrow independent numerical verdict from Harness events', () => {
  const evidence = flagQuantumCallEvidence(vqeEvents());
  assert.equal(evidence.vqeNumericalEvidence.status, 'passed');
  assert.equal(evidence.vqeNumericalEvidence.passed, true);
  assert.ok(Math.abs(evidence.vqeNumericalEvidence.computedEnergy + 1) < 1e-12);
  assert.ok(evidence.vqeNumericalEvidence.energyVariance < 1e-12);
  assert.equal(evidence.scientificResultValidated, null, 'a parity-block calculation is not full scientific validation');
  assert.equal(JSON.stringify(evidence).includes('hamiltonian'), false, 'raw tool arguments must remain private');
});

test('runtime evidence rejects mismatched loss, unconverged state, and failed transport', () => {
  assert.deepEqual(flagQuantumCallEvidence(vqeEvents({ loss: 0 })).vqeNumericalEvidence.reasonCodes,
    ['REPORTED_LOSS_MISMATCH']);
  const unconverged = flagQuantumCallEvidence(vqeEvents({ theta: 0, loss: 0 })).vqeNumericalEvidence;
  assert.equal(unconverged.status, 'failed');
  assert.ok(unconverged.reasonCodes.includes('GROUND_ENERGY_NOT_REACHED'));
  assert.ok(unconverged.reasonCodes.includes('ENERGY_VARIANCE_TOO_HIGH'));
  assert.deepEqual(flagQuantumCallEvidence(vqeEvents({ failed: true })).vqeNumericalEvidence.reasonCodes,
    ['TRAINING_TOOL_FAILED']);
});

test('a failed MCP envelope cannot certify nested successful VQE training data', () => {
  const events = vqeEvents();
  const successfulPayload = JSON.parse(events[1].content[0].text);
  events[1].content[0].text = JSON.stringify({ status: 'error', result: successfulPayload.result });
  const evidence = flagQuantumCallEvidence(events);
  assert.equal(evidence.callsReturned, 1, 'the transport returned a response');
  assert.equal(evidence.vqeNumericalEvidence.status, 'failed');
  assert.equal(evidence.vqeNumericalEvidence.passed, false);
  assert.deepEqual(evidence.vqeNumericalEvidence.reasonCodes, ['TRAINING_RESPONSE_FAILED']);

  events[1].content[0].text = JSON.stringify({ status: 'failed' });
  assert.deepEqual(flagQuantumCallEvidence(events).vqeNumericalEvidence.reasonCodes,
    ['TRAINING_RESPONSE_FAILED']);

  events[1].content[0].text = JSON.stringify({ payload: {
    status: 'error', result: successfulPayload.result,
  } });
  assert.deepEqual(flagQuantumCallEvidence(events).vqeNumericalEvidence.reasonCodes,
    ['TRAINING_RESPONSE_FAILED']);
});

test('unsupported ansatz and malformed results cannot be reported as passing', () => {
  const extraGate = JSON.stringify([
    { name: 'x', index: [0] },
    { name: 'ry', index: [1], parameters: { theta: { $parameter: 'theta' } } },
    { name: 'cx', index: [1, 0], control: 0 },
  ]);
  assert.equal(flagQuantumCallEvidence(vqeEvents({ circuit: extraGate })).vqeNumericalEvidence.status, 'unsupported');
  assert.equal(flagQuantumCallEvidence(vqeEvents({ theta: 'not a number' })).vqeNumericalEvidence.status, 'incomplete');
  assert.equal(flagQuantumCallEvidence([
    { type: 'assistant.message', text: 'VQE converged to -1' },
  ]).vqeNumericalEvidence.status, 'not_observed');
});

test('the global bound includes even-parity diagonal terms', () => {
  const terms = [
    { pauli: 'ZI', coefficient: -2 }, { pauli: 'IZ', coefficient: -2 },
    { pauli: 'ZZ', coefficient: 0 }, { pauli: 'XX', coefficient: -1 },
  ];
  const evidence = flagQuantumCallEvidence(vqeEvents({ hamiltonian: terms })).vqeNumericalEvidence;
  assert.ok(Math.abs(evidence.exactGroundEnergy + Math.hypot(4, 1)) < 1e-12);
  assert.equal(evidence.status, 'failed', 'an odd-parity ansatz cannot certify a lower even-parity ground state');
});

test('calls and results are counted from events without leaking arguments or output', () => {
  const evidence = flagQuantumCallEvidence([
    { type: 'tool.call', name: 'mcp__flagquantum__simulate_circuit_tool', callId: 'one', time: 1000, argsJson: 'secret' },
    { type: 'tool.result', callId: 'one', time: 1500, isError: false, content: 'sensitive result' },
    { type: 'tool.call', name: 'mcp__flagquantum__simulate_circuit_tool', callId: 'two', time: 2000 },
    { type: 'tool.result', callId: 'two', time: 2200, isError: true },
    { type: 'tool.call', name: 'mcp__flagquantum__emit_openqasm_tool', callId: 'three', time: 3000 },
    { type: 'tool.result', callId: 'one', time: 4000, isError: false },
  ]);
  assert.deepEqual([evidence.callsTotal, evidence.callsReturned, evidence.callsFailed, evidence.callsPending], [3, 1, 1, 1]);
  assert.deepEqual(evidence.interfacesUsed, ['mcp__flagquantum__simulate_circuit_tool', 'mcp__flagquantum__emit_openqasm_tool']);
  assert.equal(evidence.calls[0].durationSeconds, 0.5);
  assert.equal(JSON.stringify(evidence).includes('secret'), false);
  assert.equal(JSON.stringify(evidence).includes('sensitive result'), false);
  assert.equal(evidence.scientificResultValidated, null);
  assert.equal(evidence.researchValidatorEvidence.status, 'not_observed');
});

function researchEvents({ evidenceStatus = 'succeeded', embeddedPassed = true, validatorPassed = true } = {}) {
  const bundle = {
    schema: 'flagquantum.research_capability_evidence_bundle.v1',
    capability: { capability_id: 'ground_state.solve.vqe' },
    status: evidenceStatus,
    validation: [
      { validator_id: 'ground_state.solve.exact', passed: embeddedPassed },
      { validator_id: 'validate.energy_variance', passed: embeddedPassed },
    ],
    provenance: { content_sha256: 'a'.repeat(64) },
  };
  const events = [
    { type: 'tool.call', name: 'mcp__flagquantum__execute_local_capability_tool', callId: 'execute', time: 1 },
    { type: 'tool.result', callId: 'execute', time: 2, isError: false,
      content: [{ type: 'text', text: JSON.stringify({ status: 'success', result: bundle }) }] },
  ];
  for (const validatorId of ['ground_state.solve.exact', 'validate.energy_variance']) {
    const callId = `validate-${validatorId}`;
    events.push({ type: 'tool.call', name: 'mcp__flagquantum__validate_evidence_tool', callId, time: 3,
      argsJson: JSON.stringify({ validator_id: validatorId, evidence: bundle }) });
    events.push({ type: 'tool.result', callId, time: 4, isError: false,
      content: [{ type: 'text', text: JSON.stringify({ status: 'success', result: {
        validator_id: validatorId, passed: validatorPassed,
      } }) }] });
  }
  return events;
}

test('research validator evidence requires successful bundle validators bound by content digest', () => {
  const evidence = flagQuantumCallEvidence(researchEvents());
  assert.equal(evidence.scientificResultValidated, null);
  assert.deepEqual(evidence.researchValidatorEvidence, {
    status: 'passed',
    passed: true,
    capabilityId: 'ground_state.solve.vqe',
    evidenceStatus: 'succeeded',
    requiredValidators: ['ground_state.solve.exact', 'validate.energy_variance'],
    passedValidators: ['ground_state.solve.exact', 'validate.energy_variance'],
    failedValidators: [],
    reasonCodes: [],
  });
  assert.equal(JSON.stringify(evidence).includes('content_sha256'), false);
});

test('a bound validator rejection is recorded without asserting independent acceptance', () => {
  const evidence = flagQuantumCallEvidence(researchEvents({ validatorPassed: false }));
  assert.equal(evidence.scientificResultValidated, null);
  assert.deepEqual(evidence.researchValidatorEvidence.failedValidators,
    ['ground_state.solve.exact', 'validate.energy_variance']);
  assert.deepEqual(evidence.researchValidatorEvidence.reasonCodes, ['EVIDENCE_VALIDATOR_FAILED']);
});

test('successful transport without matching validator calls remains incomplete', () => {
  const events = researchEvents().slice(0, 2);
  const evidence = flagQuantumCallEvidence(events);
  assert.equal(evidence.scientificResultValidated, null);
  assert.equal(evidence.researchValidatorEvidence.status, 'incomplete');
  assert.deepEqual(evidence.researchValidatorEvidence.reasonCodes, ['EVIDENCE_VALIDATION_NOT_OBSERVED']);
});

test('earlier validators cannot certify a later execution with the same digest', () => {
  const events = researchEvents();
  events.push({ ...events[0], callId: 'execute-again', time: 5 });
  events.push({ ...events[1], callId: 'execute-again', time: 6 });
  const evidence = flagQuantumCallEvidence(events);
  assert.equal(evidence.researchValidatorEvidence.status, 'incomplete');
  assert.deepEqual(evidence.researchValidatorEvidence.passedValidators, []);
  assert.deepEqual(evidence.researchValidatorEvidence.reasonCodes, ['EVIDENCE_VALIDATION_NOT_OBSERVED']);
  assert.equal(JSON.stringify(evidence.calls).includes('eventIndex'), false);
});

test('a validator called before the execution result cannot certify it', () => {
  const events = researchEvents();
  const reordered = [events[0], events[2], events[3], events[4], events[5], events[1]];
  const evidence = flagQuantumCallEvidence(reordered);
  assert.equal(evidence.researchValidatorEvidence.status, 'incomplete');
  assert.deepEqual(evidence.researchValidatorEvidence.passedValidators, []);
});

test('a mismatched validator response cannot satisfy another validator', () => {
  const events = researchEvents();
  const response = JSON.parse(events[3].content[0].text);
  response.result.validator_id = 'validate.energy_variance';
  events[3].content[0].text = JSON.stringify(response);
  const evidence = flagQuantumCallEvidence(events);
  assert.equal(evidence.researchValidatorEvidence.status, 'incomplete');
  assert.deepEqual(evidence.researchValidatorEvidence.passedValidators, ['validate.energy_variance']);
  assert.equal(evidence.scientificResultValidated, null);
});

test('validator responses for another evidence digest cannot validate this execution', () => {
  const events = researchEvents();
  const args = JSON.parse(events[2].argsJson);
  args.evidence.provenance.content_sha256 = 'b'.repeat(64);
  events[2].argsJson = JSON.stringify(args);
  const evidence = flagQuantumCallEvidence(events);
  assert.equal(evidence.researchValidatorEvidence.status, 'incomplete');
  assert.deepEqual(evidence.researchValidatorEvidence.passedValidators, ['validate.energy_variance']);
  assert.equal(evidence.scientificResultValidated, null);
});

test('failed embedded scientific validation is a failed acceptance', () => {
  const evidence = flagQuantumCallEvidence(researchEvents({ evidenceStatus: 'validation_failed', embeddedPassed: false }));
  assert.equal(evidence.scientificResultValidated, null);
  assert.equal(evidence.researchValidatorEvidence.status, 'failed');
  assert.deepEqual(evidence.researchValidatorEvidence.reasonCodes, ['EVIDENCE_STATUS_NOT_SUCCEEDED']);
});

test('failed execution envelope cannot certify an embedded successful bundle', () => {
  const events = researchEvents();
  const response = JSON.parse(events[1].content[0].text);
  response.status = 'error';
  events[1].content[0].text = JSON.stringify(response);
  const evidence = flagQuantumCallEvidence(events).researchValidatorEvidence;
  assert.equal(evidence.status, 'failed');
  assert.equal(evidence.passed, false);
  assert.deepEqual(evidence.reasonCodes, ['EXECUTION_RESPONSE_FAILED']);
});

test('a failed execution transport keeps its distinct failure reason', () => {
  const events = researchEvents();
  events[1].isError = true;
  const evidence = flagQuantumCallEvidence(events).researchValidatorEvidence;
  assert.equal(evidence.status, 'failed');
  assert.deepEqual(evidence.reasonCodes, ['EXECUTION_TOOL_FAILED']);
});

test('failed validator envelope cannot certify an embedded passing report', () => {
  const events = researchEvents();
  const response = JSON.parse(events[3].content[0].text);
  response.status = 'error';
  events[3].content[0].text = JSON.stringify(response);
  const evidence = flagQuantumCallEvidence(events).researchValidatorEvidence;
  assert.equal(evidence.status, 'failed');
  assert.deepEqual(evidence.failedValidators, ['ground_state.solve.exact']);
  assert.deepEqual(evidence.reasonCodes, ['EVIDENCE_VALIDATOR_FAILED']);
});

test('a bound validator transport failure is a scientific validation failure', () => {
  const events = researchEvents();
  events[3].isError = true;
  events[3].content = [{ type: 'text', text: 'validator process failed' }];
  const evidence = flagQuantumCallEvidence(events);
  assert.equal(evidence.callsFailed, 1);
  assert.equal(evidence.researchValidatorEvidence.status, 'failed');
  assert.deepEqual(evidence.researchValidatorEvidence.failedValidators, ['ground_state.solve.exact']);
  assert.deepEqual(evidence.researchValidatorEvidence.reasonCodes, ['EVIDENCE_VALIDATOR_FAILED']);
  assert.equal(JSON.stringify(evidence).includes('validator process failed'), false);
});

test('a failed validator for another bundle is not attributed to this run', () => {
  const events = researchEvents();
  const args = JSON.parse(events[2].argsJson);
  args.evidence.provenance.content_sha256 = 'b'.repeat(64);
  events[2].argsJson = JSON.stringify(args);
  events[3].isError = true;
  events[3].content = [{ type: 'text', text: 'other bundle failed' }];
  const evidence = flagQuantumCallEvidence(events).researchValidatorEvidence;
  assert.equal(evidence.status, 'incomplete');
  assert.deepEqual(evidence.failedValidators, []);
  assert.deepEqual(evidence.passedValidators, ['validate.energy_variance']);
});
