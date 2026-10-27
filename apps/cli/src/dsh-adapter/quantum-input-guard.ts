import { preflightFlagQuantum } from '#flagqai/quantum-preflight'
import { quantumCapabilityFor, recognizedQuantumCalculation } from '#flagqai/quantum-capability'

/** The first interactive prompt may be unknown at startup. Check a later
 * molecular request at the native input boundary before Harness receives it.
 * The guard does not create an Agent, choose a model, or execute the user task. */
export async function guardFlagQuantumInput(
  presetId: string | undefined,
  text: string,
  cwd: string,
  probe: typeof preflightFlagQuantum = preflightFlagQuantum,
): Promise<boolean> {
  if (presetId !== 'flagquantum') return false
  // Ordinary conversation and coding requests keep their native path. A
  // scientific calculation without a verified MCP route must fail before the
  // Harness model can improvise an unsupported primary solver.
  if (!recognizedQuantumCalculation(text)) return false
  const capability = quantumCapabilityFor(text)
  if (capability.id !== 'research-ground-state') return false
  await probe({ task: text, cwd })
  return true
}
