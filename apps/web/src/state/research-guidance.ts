import type { PythonRun } from "../api/python-runs";
import { scientificSource } from "../tasks/scientific-synthesis.mjs";
import { synthValidationSource } from "../tasks/synth-constraints.mjs";
import { synthOptimizationSource } from "../tasks/synth-optimization.mjs";
import { qaoaSource } from "../tasks/qaoa-maxcut.mjs";
import { pythonExample } from "./python-workspace.ts";
import { synthesisExamples } from "./synthesis-catalog.ts";

export type ResearchGuidance = {
  title: string;
  question: string;
  change: string;
  observe: string;
  check: string;
  limit: string;
};

const officialGuidance: Record<string, ResearchGuidance> = {
  "functions/qft": {
    title: "Scale the Fourier register",
    question: "How does register size change Fourier-circuit resource costs?",
    change:
      "Keep this run as the baseline. Change allocate(4, x) to allocate(5, x), then run a new version in a compatible SDK environment.",
    observe:
      "Compare qubit count, operation count and circuit depth in Jobs. Keep input preparation and other synthesis settings fixed.",
    check:
      "For this zero-initialized input, check all named probabilities against 1 / 2**n. A broader QFT correctness study also needs nonzero input states and phase-sensitive checks.",
    limit:
      "This study covers one input. Additional inputs and phase-sensitive checks are needed to verify the full QFT. Larger registers can increase simulation memory sharply.",
  },
  "functions/hamiltonian_evolution/suzuki_trotter": {
    title: "Study evolution time",
    question: "How do output probabilities change with evolution time?",
    change:
      "Keep this run as the baseline. Change build_program(time: float = 0.37) to use 0.74, then run again; keep the Hamiltonian and product-formula settings fixed.",
    observe:
      "Compare named probabilities and resource costs. Record each time as a distinct target problem.",
    check:
      "Compare each time separately against exact classical evolution of this small Hamiltonian. Measure approximation error before claiming accuracy.",
    limit:
      "Use an exact reference at each time to measure product-formula error or state fidelity.",
  },
  "tutorials/basics/quantum_programming/synthesis_tutorial": {
    title: "Compare synthesis objectives",
    question:
      "Does a depth objective change resources for the same arithmetic?",
    change:
      'Keep this run as the baseline. Change the final program = build_program("width") call to build_program("depth"), then run again.',
    observe:
      "Compare qubits, operations and depth. Keep the function, input width, input state and memory bound unchanged.",
    check:
      "Check every named (x, y) outcome against y = x*x + 1 and the expected uniform input probability 1/8 for x from 0 to 7.",
    limit:
      "An objective is a search preference. Report measured tradeoffs and use suitable equivalence checks.",
  },
};

const exampleGuidance = new Map<string, ResearchGuidance>();
for (const example of synthesisExamples) {
  const guide = officialGuidance[example.id];
  if (guide && example.source) exampleGuidance.set(example.source, guide);
}

exampleGuidance.set(pythonExample, {
  title: "Compare an entangled pair with a product state",
  question: "How does the controlled-X gate change the recorded outcomes?",
  change:
    "Save this run as your reference. Remove circuit.cx(0, 1) in a copy and run it with the same shots and seed.",
  observe: "Compare the two occupied bitstrings before and after the change.",
  check:
    "Trace the Hadamard and controlled-X operations, then check the observed probabilities against their predicted values.",
  limit:
    "A phase-sensitive measurement is needed to distinguish the Bell state from a classical mixture with the same Z-basis counts.",
});

for (const bits of [1, 2]) {
  exampleGuidance.set(scientificSource(bits), {
    title: "Compare grid sizes",
    question: "How does representing more grid points change circuit cost?",
    change:
      bits === 1
        ? "Keep this result, then open the 2-bit grid in Synthesis and run its Python copy."
        : "Compare this result to the saved 1-bit grid. To test a new potential, update the computation and classical reference in a copy.",
    observe:
      "Compare qubits, gates and depth for the 4-point and 16-point grids.",
    check:
      "Check every named output against x*x + y*y at its recorded grid coordinates.",
    limit:
      "Grid width expands the integer domain at the same spacing. The circuit evaluates a dimensionless potential register.",
  });
}

exampleGuidance.set(synthValidationSource, {
  title: "Change one synthesis constraint",
  question: "How does routing change resources for the same arithmetic?",
  change:
    'Use a new copy. Keep the objective fixed and vary only topology, for example from None to "line".',
  observe:
    "Compare the saved gate count, qubits and depth for the two targets.",
  check:
    "Keep the input widths and x*x + y reference fixed. Check all eight named outputs and both FQX replays.",
  limit:
    "The recorded checks cover the named probabilities and the saved circuits. Phase equivalence and compiler optimality require separate evidence.",
});

exampleGuidance.set(synthOptimizationSource, {
  title: "Compare optimization levels",
  question:
    "Does a different optimization level reduce the recorded circuit cost?",
  change:
    "In a copy, set OPTIMIZATION_LEVEL to 1. Keep the arithmetic, input state and synthesis constraints fixed.",
  observe: "Compare gate count and depth to the baseline from each run.",
  check:
    "Keep the classical-output, prepared-state and archived replay checks. Retain both saved records even when resources stay the same.",
  limit:
    "The prepared-state check covers the specified input. General unitary equivalence requires additional tests.",
});

exampleGuidance.set(qaoaSource, {
  title: "Test a change to the QAOA search",
  question: "How does search effort affect measured solution quality and cost?",
  change:
    "Keep the graph, objective and reference result. Change one search setting in a copy and run it explicitly.",
  observe:
    "Compare objective value, solution distribution, resources and run time.",
  check:
    "Compare the small graph against its classical optimum and replay the selected saved circuits.",
  limit:
    "Report the search budget and sampling settings alongside the result. This study covers one graph.",
});

export function savedResearchGuidance(
  run: Pick<
    PythonRun,
    "project" | "source" | "status" | "collection_status" | "experiments"
  >,
): ResearchGuidance | undefined {
  if (
    run.project ||
    run.status !== "completed" ||
    run.collection_status !== "completed" ||
    !run.experiments?.some((file) => file.has_result)
  )
    return undefined;
  return exampleGuidance.get(run.source);
}
