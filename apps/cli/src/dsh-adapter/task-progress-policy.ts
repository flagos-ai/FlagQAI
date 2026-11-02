import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'

const SECTION_NAME = 'flagqai:task-progress'

/** Guide only Harness sessions that can actually write a Todo list. */
export function withTaskProgressPolicy(assembly: PromptAssembly): PromptAssembly {
  assembly = withWorkbenchPolicy(assembly)
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

/** Applied only when this native session has accepted Web workbench controls. */
function withWorkbenchPolicy(assembly: PromptAssembly): PromptAssembly {
  if (!assembly.tools.some(tool => tool.name === 'workbench_run_python')) {
    return assembly.sections.some(section => section.name === 'flagqai:workbench')
      ? { ...assembly, sections: assembly.sections.filter(section => section.name !== 'flagqai:workbench') }
      : assembly
  }
  if (assembly.sections.some(section => section.name === 'flagqai:workbench')) return assembly
  return { ...assembly, sections: [...assembly.sections, {
    name: 'flagqai:workbench',
    text: 'For a Web workbench task, use the workbench_* tools directly. They bind to the current workspace and native session; do not inspect platform source code, search for interpreters, install SDKs or simulate manually to discover these operations. Inspect shared models before running their exact revision. Create a new Python model for new code; never replace an unsaved browser draft. Use workbench_wait_run instead of shell sleep or rapid repeated calls to await execution and collection; a waiting deadline does not cancel or resubmit the run. Explain actual errors; retain failed runs. Saved experiment tools return SDK-loaded evidence, original filenames, hashes and download links: use detail=full for more evidence rather than searching temporary directories, copying archives or manually unpacking ZIP members. Finish successful experiments by calling workbench_present_experiment for the circuit and then the recorded result; its returned evidence can support the final answer without a duplicate read. For comparisons call workbench_compare_experiments with the actual two saved artifact IDs. Navigation respects Follow Agent, so do not claim a page opened when following is off. If controls expire or a tool fails, report the concrete error instead of claiming completion.',
  }] }
}
