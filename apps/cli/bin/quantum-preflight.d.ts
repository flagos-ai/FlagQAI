export interface QuantumCapability {
  readonly id: string
  readonly primaryTool: string
}

export function quantumCapabilityFor(task?: string): QuantumCapability
export function preflightFlagQuantum(options?: { task?: string; cwd?: string }): Promise<unknown>
export { FLAGQUANTUM_MCP_ARGS, FLAGQUANTUM_MCP_PACKAGE } from './quantum-mcp-profile.js'
