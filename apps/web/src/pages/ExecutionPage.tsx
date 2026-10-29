import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
export function ExecutionPage({
  state,
  dispatch,
  run,
  backendLabel = "Configured CPU backend",
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  run: () => void;
  backendLabel?: string;
}) {
  const valid =
    Number.isInteger(state.shots) &&
    state.shots >= 1 &&
    state.shots <= 100000 &&
    Number.isInteger(state.seed) &&
    state.seed >= 0 &&
    state.seed <= 2147483647;
  return (
    <section className="fq-execution">
      <div className="fq-pane-title">EXECUTION CONFIGURATION</div>
      <div className="fq-toolbar">
        <span>
          {state.execution?.name || state.name} ·{" "}
          {state.execution ? "Compiled program snapshot" : "Model draft"}
        </span>
        <div className="push" />
        <button
          className="primary"
          disabled={state.busy || !valid}
          onClick={run}
        >
          {state.busy ? "Submitting…" : "Run →"}
        </button>
      </div>
      <div className="fq-content-pad">
        {state.execution && (
          <section className="fq-panel">
            <b>Executing selected program: {state.execution.name}</b>
            <p>
              The task uses this source snapshot. Your Model draft is unchanged.
              {state.execution.experiment &&
                " This is a new execution using the current backend and settings; the archived plan and results stay unchanged."}
            </p>
            <button
              className="link"
              onClick={() => dispatch({ type: "use-draft" })}
            >
              Use current Model draft instead
            </button>
          </section>
        )}
        <section className="fq-panel">
          <small className="eyebrow">CONFIGURATION</small>
          <div className="fq-form-grid">
            <label>
              Num Shots
              <input
                type="number"
                min={1}
                max={100000}
                value={state.shots}
                onChange={(e) =>
                  dispatch({
                    type: "preferences",
                    shots: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Random Seed
              <input
                type="number"
                min={0}
                max={2147483647}
                value={state.seed}
                onChange={(e) =>
                  dispatch({
                    type: "preferences",
                    seed: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Job Name
              <input
                value={state.jobName}
                placeholder="Optional job name"
                onChange={(e) =>
                  dispatch({ type: "preferences", jobName: e.target.value })
                }
              />
            </label>
          </div>
          {!valid && (
            <p role="alert">
              Enter whole-number shots (1–100,000) and seed (0–2,147,483,647).
            </p>
          )}
        </section>
        {state.error && (
          <p className="fq-diagnostic error" role="alert">
            {state.error.message}
          </p>
        )}
        <section className="fq-panel">
          <small className="eyebrow">REAL COMPUTATION</small>
          <h3>FlagQuantum → {backendLabel} → sampled counts</h3>
          <p>
            2 CPU threads per task · 1 active task · up to 3 waiting · 16 qubits
            · 90-second remote process limit.
          </p>
          <p>
            Actual compiler and simulator results are persisted in the local job
            store. GPU and quantum hardware are not connected.
          </p>
        </section>
      </div>
    </section>
  );
}
