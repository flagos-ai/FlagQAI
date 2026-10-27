import { createInterface } from 'node:readline'

const researchNames = [
  'search_capabilities_tool', 'describe_capability_tool',
  'validate_capability_input_tool', 'estimate_capability_tool',
  'execute_local_capability_tool', 'validate_evidence_tool',
]
const names = process.env.FQ_TEST_MODE === 'missing-vqe'
  ? ['simulate_circuit_tool']
  : ['simulate_circuit_tool', 'train_parameters_tool',
      ...(process.env.FQ_TEST_MODE?.startsWith('research-')
        ? researchNames.filter(name => process.env.FQ_TEST_MODE !== 'research-missing' || name !== 'execute_local_capability_tool') : [])]

function researchResult(name, args) {
  const validators = ['ground_state.solve.exact', 'validate.energy_variance']
  const evidence = {
    schema: 'flagquantum.research_capability_evidence_bundle.v1',
    status: 'succeeded',
    capability: { capability_id: 'ground_state.solve.vqe', provider: 'flagquantum-native' },
    execution: { fallback_used: false },
    metrics: { objective_evaluations: 5 },
    result: {
      energy: process.env.FQ_TEST_MODE === 'research-bad-energy' ? -1.9
        : process.env.FQ_TEST_MODE === 'research-missing-energy' ? undefined : -2,
      statevector: { basis_states: ['00', '01', '10', '11'], amplitudes: [
        { real: 0, imag: 0 }, { real: 1, imag: 0 }, { real: 0, imag: 0 }, { real: 0, imag: 0 },
      ] },
    },
    validation: validators.map(validator_id => ({ validator_id, passed: true })),
  }
  const result = name === 'search_capabilities_tool'
    ? [{ capability_id: 'ground_state.solve.vqe' }]
    : name === 'describe_capability_tool'
      ? { capability_id: 'ground_state.solve.vqe', implementation_status: 'available', validators }
      : name === 'validate_capability_input_tool'
        ? { passed: true }
        : name === 'estimate_capability_tool'
          ? { supported: true, metrics: { objective_evaluations: 5 } }
          : name === 'execute_local_capability_tool'
            ? evidence
            : { validator_id: args.validator_id, passed: process.env.FQ_TEST_MODE !== 'research-bad-validation' }
  return { content: [{ type: 'text', text: JSON.stringify({ status: 'success', result }) }] }
}
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line)
  if (message.id === undefined) continue
  if (process.env.FQ_TEST_MODE === 'stalled-initialize' && message.method === 'initialize') {
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const result = message.method === 'initialize'
    ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'flagquantum-test', version: '1' } }
    : message.method === 'tools/list'
      ? { tools: names.map(name => ({ name, inputSchema: { type: 'object' } })) }
      : message.method === 'tools/call'
        ? researchNames.includes(message.params.name)
          ? researchResult(message.params.name, message.params.arguments)
          : message.params.name === 'train_parameters_tool'
          ? process.env.FQ_TEST_MODE === 'failed-training'
            ? { isError: true, content: [{ type: 'text', text: 'Trainer dependency failed' }] }
            : { content: [{ type: 'text', text: JSON.stringify({ status: 'success', completed_steps: 1,
              losses: [0.5], final_loss: process.env.FQ_TEST_MODE === 'invalid-training' ? null : 0.5,
              parameters: { theta: 0.1 } }) }] }
          : process.env.FQ_TEST_MODE === 'failed-simulation'
            ? { isError: true, content: [{ type: 'text', text: 'Dependency import failed' }] }
            : { content: [{ type: 'text', text: JSON.stringify({ outputs: [{ kind: 'probabilities', value: process.env.FQ_TEST_MODE === 'incorrect-simulation' ? [1, 0, 0, 0] : [0.5, 0, 0, 0.5] }] }) }] }
      : null
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n')
}
