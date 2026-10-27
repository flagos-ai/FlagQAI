/** Pure quantum task admission and capability policy; no MCP process or CLI argument parsing. */
export declare function recognizedQuantumCalculation(task: string): boolean

export interface QuantumCapability {
  readonly id: string
  readonly primaryTool: string
}

export declare function quantumCapabilityFor(task?: string): QuantumCapability
export declare function requiredQuantumTools(task?: string): string[]
export declare function researchQuantumTools(): string[]
