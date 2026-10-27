import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'

const SECTION_NAME = 'flagqai:task-progress'

/** Guide only Harness sessions that can actually write a Todo list. */
export function withTaskProgressPolicy(assembly: PromptAssembly): PromptAssembly {
  // Plan mode has its own review contract and explicitly postpones Todo
  // tracking until implementation begins.
  const enabled = assembly.tools.some(tool => tool.name === 'todo_write') &&
    !assembly.sections.some(section => section.name === 'plan:policy' && section.text.trim() !== '')
  const present = assembly.sections.some(section => section.name === SECTION_NAME)
  if (!enabled) return present
    ? { ...assembly, sections: assembly.sections.filter(section => section.name !== SECTION_NAME) }
    : assembly
  if (present) return assembly

  return {
    ...assembly,
    sections: [...assembly.sections, {
      name: SECTION_NAME,
      text: 'For each new nontrivial user request with several concrete steps, call todo_write with a fresh task-specific list before starting substantive work, even if the previous task\'s list is complete. Do not carry completed items from an earlier request into the new list. Keep the list brief and update each step as work proceeds, including verification. Do not wait for the user to request a plan. Skip the list for simple questions and single-step tasks. Never mark a step complete before it is done. Follow any more specific user or active mode instructions.',
    }],
  }
}
