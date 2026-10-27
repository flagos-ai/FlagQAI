/** Shared conservative calculation intent; capability and MCP checks remain separate. */
export declare function recognizedQuantumCalculation(task: string): boolean
export declare function defaultQuantumSession(args: readonly string[], env?: NodeJS.ProcessEnv): boolean
export declare function automaticQuantumTask(args: readonly string[], env?: NodeJS.ProcessEnv): string | null
