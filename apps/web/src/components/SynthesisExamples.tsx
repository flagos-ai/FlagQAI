import { savedOptimizationPair } from "../state/synthesis-evidence";
import {
  synthOptimizationSource,
  synthOptimizationTaskName,
} from "../tasks/synth-optimization.mjs";
import {
  synthValidationSource,
  synthValidationTaskName,
} from "../tasks/synth-constraints.mjs";
import { ScientificSynthesis } from "./ScientificSynthesis";
import type {
  Model,
  ProgramSnapshot,
  WorkspaceAction,
} from "../contracts/quantum-workspace";

export function SynthesisExamples({
  programs,
  dispatch,
  onSelect,
}: {
  programs: ProgramSnapshot[];
  dispatch: (action: WorkspaceAction) => void;
  onSelect: (model: Model) => void;
}) {
  const optimized = savedOptimizationPair(programs);
  const select = (action: WorkspaceAction) =>
    action.type === "model" ? onSelect(action.model) : dispatch(action);
  return (
    <section className="fq-synthesis-examples" aria-label="Synthesis examples">
      <h3>Synthesis examples</h3>
      <details className="fq-synth-evidence">
        <summary>Verify synthesis across constraints</summary>
        <p>
          Generate and compare two circuits for the same arithmetic model with
          different topology and objective settings.
        </p>
        <button
          onClick={() =>
            select({
              type: "model",
              model: {
                name: synthValidationTaskName,
                source: synthValidationSource,
                language: "python",
              },
              preserveDraft: true,
            })
          }
        >
          Open constraint verification model
        </button>
      </details>
      <details className="fq-synth-evidence">
        <summary>Verify a compiler optimization</summary>
        <p>
          Run the saved baseline and candidate checks, then compare their
          recorded resources.
        </p>
        <button
          onClick={() =>
            select({
              type: "model",
              model: {
                name: synthOptimizationTaskName,
                source: synthOptimizationSource,
                language: "python",
              },
              preserveDraft: true,
            })
          }
        >
          Open optimization model
        </button>
        {optimized && (
          <button
            onClick={() =>
              select({
                type: "compare-experiments",
                ...optimized,
              })
            }
          >
            Compare saved optimization pair
          </button>
        )}
      </details>
      <ScientificSynthesis programs={programs} dispatch={select} />
    </section>
  );
}
