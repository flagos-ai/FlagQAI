import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'

const SECTION_NAME = 'flagqai:flagquantum-tools'

/** Fail before inference if the selected scientific preset has no mounted
 * FlagQuantum tools; never let an ordinary coding composition masquerade as
 * a FlagQuantum-backed run. Harness still owns the Agent and tool execution. */
export function withFlagQuantumPolicy(assembly: PromptAssembly, presetId?: string): PromptAssembly {
  if (presetId !== 'flagquantum') return assembly
  if (!assembly.tools.some(tool => tool.name.startsWith('mcp__flagquantum__'))) {
    throw new Error('FlagQuantum preset has no mounted MCP tools. Check the pinned MCP server and retry; no model request was sent.')
  }
  if (assembly.sections.some(section => section.name === SECTION_NAME)) return assembly
  return {
    ...assembly,
    sections: [...assembly.sections, {
      name: SECTION_NAME,
      text: 'For quantum-scientific tasks, discover the available FlagQuantum tools and use them for the primary calculation when they support the task. Independently validate numerical results with a separate implementation. Do not claim FlagQuantum was used without an actual tool call. If FlagQuantum lacks the required capability or a call fails, state the interface and reason; do not silently switch to NumPy, a self-written simulator, or another primary solver. Ask the user before such a fallback. Do not invent tool counts, timings, or platform evidence. For requested reproducible local artifacts, the optional Python run helper is available through `flagqai science --pythonpath`; its recorded thresholds are not an independent platform verdict.',
    }],
  }
}
