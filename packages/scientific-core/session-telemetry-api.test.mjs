import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFlagQaiServer } from '../server/index.mjs';
import { createFlagQaiClient } from '../sdk/index.mjs';
import { createPermissionDecisionStore } from './permission-decisions.mjs';

test('the local API and SDK expose durable redacted tool telemetry', async () => {
  const events = [
    { type: 'tool.call', callId: 'one', name: 'mcp__flagquantum__simulate_circuit_tool', time: 1000, argsJson: 'private' },
    { type: 'tool.result', callId: 'one', time: 1500, isError: false, text: 'secret' },
  ];
  const session = {
    ref: { backendId: 'fixture', sessionId: 'native-one' }, cwd: '/tmp/fixture', status: 'idle', capabilities: {},
    subscribe: () => () => {}, history: async () => events, dispose: async () => {},
  };
  const registry = { ids: ['fixture'], load: async () => ({ descriptor: { label: 'Fixture' }, open: async () => session }) };
  const server = createFlagQaiServer({ port: 0, registry });
  try {
    const address = await server.listen();
    const client = createFlagQaiClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    const resource = await client.openSession({ backendId: 'fixture', cwd: '/tmp/fixture' });
    const first = await client.scienceTelemetry(resource.id);
    assert.equal(first.runId, resource.id);
    assert.deepEqual(first.counts, { toolCalls: 1, toolReturned: 1, toolFailed: 0, toolPending: 0,
      permissionDecisions: null, scientificInterventions: null });
    assert.equal(first.events[1].durationSeconds, 0.5);
    assert.equal(JSON.stringify(first).includes('private'), false);
    assert.equal(JSON.stringify(first).includes('secret'), false);
    events.push({ type: 'tool.call', callId: 'two', name: 'bash', time: 2000 });
    const complete = await client.scienceTelemetry(resource.id);
    assert.equal(complete.counts.toolCalls, 2, 'endpoint must read complete current history, not an initial snapshot');
    assert.equal(complete.counts.toolPending, 1);
  } finally { await server.close(); }
});

test('the local API and SDK report a failed research validator call', async () => {
  const bundle = {
    schema: 'flagquantum.research_capability_evidence_bundle.v1',
    capability: { capability_id: 'ground_state.solve.vqe' },
    status: 'succeeded',
    validation: [{ validator_id: 'ground_state.solve.exact', passed: true }],
    provenance: { content_sha256: 'a'.repeat(64) },
  };
  const events = [
    { type: 'tool.call', callId: 'execute', name: 'mcp__flagquantum__execute_local_capability_tool' },
    { type: 'tool.result', callId: 'execute', isError: false,
      content: [{ type: 'text', text: JSON.stringify({ status: 'success', result: bundle }) }] },
    { type: 'tool.call', callId: 'validate', name: 'mcp__flagquantum__validate_evidence_tool',
      argsJson: JSON.stringify({ validator_id: 'ground_state.solve.exact', evidence: bundle }) },
    { type: 'tool.result', callId: 'validate', isError: true,
      content: [{ type: 'text', text: 'private validator failure' }] },
  ];
  const session = {
    ref: { backendId: 'fixture', sessionId: 'research-failure' }, cwd: '/tmp/fixture',
    status: 'idle', capabilities: {}, subscribe: () => () => {},
    history: async () => events, dispose: async () => {},
  };
  const registry = { ids: ['fixture'], load: async () => ({ descriptor: { label: 'Fixture' }, open: async () => session }) };
  const server = createFlagQaiServer({ port: 0, registry });
  try {
    const address = await server.listen();
    const client = createFlagQaiClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    const resource = await client.openSession({ backendId: 'fixture', cwd: '/tmp/fixture' });
    const evidence = await client.flagQuantumEvidence(resource.id);
    assert.equal(evidence.researchValidatorEvidence.status, 'failed');
    assert.deepEqual(evidence.researchValidatorEvidence.failedValidators, ['ground_state.solve.exact']);
    assert.deepEqual(evidence.researchValidatorEvidence.reasonCodes, ['EVIDENCE_VALIDATOR_FAILED']);
    assert.equal(JSON.stringify(evidence).includes('private validator failure'), false);
    assert.equal(JSON.stringify(evidence).includes('content_sha256'), false);
  } finally { await server.close(); }
});

test('the local SDK exposes bounded research VQE numbers without raw scientific inputs', async () => {
  const request = {
    schema: 'flagquantum.ground_state_vqe_request.v1', fixed_hamming_weight: 1,
    hamiltonian: { schema: 'flagquantum.pauli_sum.v1', n_qubits: 2,
      coefficient_unit: 'hartree', basis_convention: 'wire_0_is_leftmost',
      terms: ['II', 'ZI', 'IZ', 'ZZ', 'XX'].map(pauli => ({ pauli,
        coefficient: pauli === 'XX' ? -1 : 0 })) },
  };
  const amplitude = 1 / Math.sqrt(2);
  const bundle = { schema: 'flagquantum.research_capability_evidence_bundle.v1',
    status: 'succeeded', capability: { capability_id: 'ground_state.solve.vqe' },
    result: { energy: -1, statevector: { basis_states: ['01', '10'],
      amplitudes: [{ real: amplitude, imag: 0 }, { real: amplitude, imag: 0 }] } } };
  const events = [
    { type: 'tool.call', callId: 'execute', name: 'mcp__flagquantum__execute_local_capability_tool',
      argsJson: JSON.stringify({ capability_id: 'ground_state.solve.vqe', request }) },
    { type: 'tool.result', callId: 'execute', isError: false,
      content: [{ type: 'text', text: JSON.stringify({ status: 'success', result: bundle }) }] },
  ];
  const session = { ref: { backendId: 'fixture', sessionId: 'research-numbers' },
    cwd: '/tmp/fixture', status: 'idle', capabilities: {}, subscribe: () => () => {},
    history: async () => events, dispose: async () => {} };
  const registry = { ids: ['fixture'], load: async () => ({ descriptor: { label: 'Fixture' }, open: async () => session }) };
  const server = createFlagQaiServer({ port: 0, registry });
  try {
    const address = await server.listen();
    const client = createFlagQaiClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    const resource = await client.openSession({ backendId: 'fixture', cwd: '/tmp/fixture' });
    const evidence = await client.flagQuantumEvidence(resource.id);
    assert.equal(evidence.researchVqeNumericalEvidence.status, 'passed');
    assert.ok(Math.abs(evidence.researchVqeNumericalEvidence.computedEnergy + 1) < 1e-12);
    assert.equal(evidence.scientificResultValidated, null);
    assert.equal(JSON.stringify(evidence).includes('basis_states'), false);
    assert.equal(JSON.stringify(evidence).includes('hamiltonian'), false);
  } finally { await server.close(); }
});

test('accepted HTTP permission decisions remain redacted and durable after resume', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flagqai-permission-api-'));
  const store = createPermissionDecisionStore({ directory: root });
  const sessionRef = { backendId: 'fixture', sessionId: 'native-durable' };
  const makeServer = () => {
    let emit;
    const session = {
      ref: sessionRef, cwd: '/tmp/fixture', status: 'idle',
      capabilities: { permissions: { respond(requestId) {
        emit?.([{ type: 'permission.settled', requestId, outcome: 'rejected' }], { wake: 'sync' });
      } } },
      subscribe(listener) { emit = listener; return () => { emit = undefined; }; },
      history: async () => [], dispose: async () => {},
    };
    const registry = { ids: ['fixture'], load: async () => ({ descriptor: { label: 'Fixture' }, open: async () => session }) };
    return { server: createFlagQaiServer({ port: 0, registry, permissionDecisionStore: store }),
      request() { emit([{ type: 'permission.request', request: { requestId: 'secret-request', command: 'private command' } }], { wake: 'sync' }); } };
  };
  let first;
  let second;
  try {
    first = makeServer();
    const address = await first.server.listen();
    const client = createFlagQaiClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    const resource = await client.openSession({ backendId: 'fixture', cwd: '/tmp/fixture' });
    assert.equal((await client.scienceTelemetry(resource.id)).counts.permissionDecisions, 0);
    first.request();
    await client.answerPermission(resource.id, 'secret-request', { kind: 'reject', message: 'private feedback' });
    const observed = await client.scienceTelemetry(resource.id);
    assert.equal(observed.counts.permissionDecisions, 1);
    assert.equal(observed.counts.scientificInterventions, null);
    assert.equal(JSON.stringify(observed).includes('private'), false);
    await first.server.close();
    first = undefined;
    second = makeServer();
    const resumedAddress = await second.server.listen();
    const resumedClient = createFlagQaiClient({ baseUrl: `http://127.0.0.1:${resumedAddress.port}` });
    const resumed = await resumedClient.openSession({ backendId: 'fixture', cwd: '/tmp/fixture', sessionId: 'native-durable' });
    const replay = await resumedClient.scienceTelemetry(resumed.id);
    assert.equal(replay.counts.permissionDecisions, 1);
    assert.equal(replay.permissionSessionKey, observed.permissionSessionKey);
    assert.deepEqual(replay.permissionOutcomes, ['rejected']);
    assert.deepEqual(replay.events, [], 'untimed permission decisions must not invent backend event order');
  } finally {
    await first?.server.close();
    await second?.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an unwritable permission journal cannot silently accept an unrecorded decision', async () => {
  let emit;
  let accepted = 0;
  const session = {
    ref: { backendId: 'fixture', sessionId: 'native-guarded' }, cwd: '/tmp/fixture', status: 'idle',
    capabilities: { permissions: { respond() { accepted += 1; } } },
    subscribe(listener) { emit = listener; return () => {}; },
    history: async () => [], dispose: async () => {},
  };
  const store = { initialize: async () => {}, prepare: async () => { throw new Error('disk unavailable'); },
    read: async () => undefined };
  const registry = { ids: ['fixture'], load: async () => ({ descriptor: { label: 'Fixture' }, open: async () => session }) };
  const server = createFlagQaiServer({ port: 0, registry, permissionDecisionStore: store });
  try {
    const address = await server.listen();
    const client = createFlagQaiClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    const resource = await client.openSession({ backendId: 'fixture', cwd: '/tmp/fixture' });
    emit([{ type: 'permission.request', request: { requestId: 'p1' } }], { wake: 'sync' });
    await assert.rejects(client.answerPermission(resource.id, 'p1', { kind: 'allow-once' }), /permission evidence/i);
    assert.equal(accepted, 0);
    assert.equal((await client.scienceTelemetry(resource.id)).counts.permissionDecisions, null);
  } finally { await server.close(); }
});
