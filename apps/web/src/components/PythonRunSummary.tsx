import type { PythonRun } from "../api/python-runs";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import {
  compilationResults,
  circuitMatchesSource,
} from "../state/compilation-results";

export function PythonRunSummary({
  state,
  run,
  dispatch,
  researchAction,
}: {
  state: WorkspaceState;
  run?: PythonRun;
  dispatch: React.Dispatch<WorkspaceAction>;
  researchAction?: React.ReactNode;
}) {
  const rows = compilationResults(state, run);
  if (!run || !rows.length || ["queued", "running"].includes(run.status))
    return null;
  const single = rows.length === 1 ? rows[0] : undefined;
  const current = rows.every((row) => circuitMatchesSource(state, row));
  return (
    <section className="fq-python-run-summary" aria-label="Run result summary">
      <div>
        <strong>
          {run.status === "completed"
            ? "Run complete"
            : "Run interrupted · circuits retained"}
        </strong>
        <span>
          {single
            ? `${single.compiled.qubits} qubits · ${single.compiled.instructions.length.toLocaleString()} operations · depth ${single.compiled.depth.toLocaleString()}`
            : `${rows.length} collected circuits`}
        </span>
        {!current && <small>Previous source · your draft is unchanged</small>}
        {["failed", "partial"].includes(run.collection_status || "") && (
          <small>
            Some results need attention · see collection details below
          </small>
        )}
      </div>
      {researchAction}
      {single && (
        <button
          onClick={() => {
            dispatch({ type: "program", id: single.id });
            dispatch({ type: "navigate", page: "program" });
          }}
        >
          View circuit
        </button>
      )}
      <button
        className="link"
        onClick={() => dispatch({ type: "model-panel", panel: "compilation" })}
      >
        Resource details
      </button>
    </section>
  );
}
