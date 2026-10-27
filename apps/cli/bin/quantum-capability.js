/** Pure task-to-interface policy. Keep MCP startup, workspace checks, and
 * runtime probing in quantum-preflight.js. This does not assert tool readiness. */
/** A narrow calculation intent shared by startup and interactive admission.
 * It is not a claim that the mounted server can perform the task. */
export function recognizedQuantumCalculation(task) {
  // A request about quantum-related source code is still a coding task.
  if (/\b(?:bug|parser|refactor|docs?|readme|test|cli|ui|package|module|function|repository|repo|code)\b|修复|重构|文档|测试|仓库|代码审查/iu.test(task)) return false
  // Saving a scientific result to a file does not turn the task into source maintenance.
  if (/\bfile\b/iu.test(task) && !/\b(?:save|write|export|store|output)\b.{0,80}\bfile\b/iu.test(task)) return false
  const execution = /\b(?:solve|compute|calculate|simulate|run|train|estimate|find|prepare|measure)\b|求解|计算|模拟|运行|训练|估计|制备|测量|算(?=\s*(?:H2|H₂|氢分子|\d+\s*量子比特))/iu
  const quantumTarget = /\b(?:vqe|variational quantum eigensolver|quantum circuit|bell state|qubits?|hamiltonian|ground.state)\b|量子电路|量子比特|贝尔态|哈密顿量|基态|变分量子/iu
  return execution.test(task) && quantumTarget.test(task)
}

const RESEARCH_TOOLS = Object.freeze([
  'search_capabilities_tool', 'describe_capability_tool',
  'validate_capability_input_tool', 'estimate_capability_tool',
  'execute_local_capability_tool', 'validate_evidence_tool',
])

export function researchQuantumTools() {
  return [...RESEARCH_TOOLS]
}

/** Only advertise task routes backed by a known, pinned MCP interface.
 * An unknown scientific task must not inherit the circuit-simulation route. */
export function quantumCapabilityFor(task = '') {
  if (task.trim() === '') {
    // The first prompt is unknown in an interactive session. Verify both
    // supported paths now, before the session can accept a model request.
    return { id: 'interactive', primaryTool: 'simulate_circuit_tool' }
  }
  if ((/\b(?:h2|hydrogen molecule|molecular|molecule|sto[- ]?3g)\b|H₂|氢分子|分子|量子化学/iu.test(task)) &&
      (/\b(?:vqe|variational quantum eigensolver|ground.state|ground energy)\b|基态|变分/iu.test(task))) {
    return { id: 'research-ground-state', primaryTool: 'execute_local_capability_tool' }
  }
  if (/\b(?:vqe|variational quantum eigensolver|ground.state)\b|基态|变分/iu.test(task)) {
    return { id: 'vqe', primaryTool: 'train_parameters_tool' }
  }
  if (/\b(?:bell state|quantum circuit|qubits?|circuit simulation|simulate|measurement|probabilities)\b|贝尔态|量子电路|量子比特|模拟|测量/iu.test(task)) {
    return { id: 'circuit-simulation', primaryTool: 'simulate_circuit_tool' }
  }
  throw Object.assign(new Error(
    'No verified FlagQuantum MCP route matches this task. Use a supported VQE or circuit-simulation task, or select tools explicitly; no model request was sent.'),
  { code: 'unsupported_quantum_task' })
}

export function requiredQuantumTools(task = '') {
  const capability = quantumCapabilityFor(task)
  if (capability.id === 'interactive') return ['simulate_circuit_tool', 'train_parameters_tool']
  if (capability.id === 'research-ground-state') return researchQuantumTools()
  return [capability.primaryTool]
}
