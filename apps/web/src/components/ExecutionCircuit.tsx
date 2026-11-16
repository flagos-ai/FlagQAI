import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";

export function ExecutionCircuit({
  state,
  dispatch,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const programs =
    state.execution &&
    !state.programs.some((program) => program.id === state.execution!.id)
      ? [state.execution, ...state.programs]
      : state.programs;
  return (
    <label className="fq-execution-circuit">
      Circuit
      <select
        aria-label="Execution circuit"
        value={state.execution?.id || ""}
        disabled={state.busy}
        onChange={(event) =>
          dispatch({
            type: "execution-circuit",
            id: event.target.value || null,
          })
        }
      >
        <optgroup label="Current draft">
          <option value="">
            {state.name} ·{" "}
            {state.language === "python" ? "Python draft" : "Model draft"}
          </option>
        </optgroup>
        {!!programs.length && (
          <optgroup label="Saved circuits">
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name} · {program.compiled.qubits} qubits ·{" "}
                {new Date(program.created).toLocaleString()}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
