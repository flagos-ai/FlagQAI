import { useEffect, useState } from "react";
import { UIIcon } from "../components/UIIcon";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
export function ExecutionPage({
  state,
  dispatch,
  run,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  run: () => void;
}) {
  const validSeed =
    Number.isInteger(state.seed) && state.seed >= 0 && state.seed <= 2147483647;
  const valid =
    Number.isInteger(state.shots) &&
    state.shots >= 1 &&
    state.shots <= 100000 &&
    validSeed;
  const [advanced, setAdvanced] = useState(() => {
    try {
      return (
        !validSeed || localStorage.getItem("fq-execution-advanced-v1") === "on"
      );
    } catch {
      return !validSeed;
    }
  });
  useEffect(() => {
    if (!validSeed) setAdvanced(true);
  }, [validSeed]);
  return (
    <section
      className="fq-execution fq-execution-compact"
      aria-label="Execution configuration"
    >
      <div className="fq-toolbar fq-execution-toolbar">
        <span className="fq-execution-identity">
          <strong>{state.execution?.name || state.name}</strong>
          <small>
            {state.execution ? "Compiled program snapshot" : "Model draft"}
          </small>
        </span>
        <div className="push" />
        <button
          className="primary"
          disabled={state.busy || !valid}
          onClick={run}
        >
          <UIIcon
            name={state.busy ? "refresh" : "play"}
            className={state.busy ? "fq-ui-busy" : ""}
            size={14}
          />
          {state.busy ? "Submitting…" : "Run"}
        </button>
      </div>
      <div className="fq-content-pad fq-execution-content">
        {state.execution && (
          <section
            className="fq-execution-source"
            aria-label="Execution source"
          >
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
        <section
          className="fq-panel fq-execution-settings"
          aria-label="Run settings"
        >
          <div className="fq-form-grid fq-execution-common">
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
          <details className="fq-execution-advanced" open={advanced}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                const open = !advanced;
                setAdvanced(open);
                try {
                  localStorage.setItem(
                    "fq-execution-advanced-v1",
                    open ? "on" : "off",
                  );
                } catch {
                  /* Keep local controls usable without storage. */
                }
              }}
            >
              Advanced options <span>Seed {state.seed}</span>
            </summary>
            <div className="fq-execution-advanced-fields">
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
              <p>Use the same seed and settings to reproduce a sampled run.</p>
            </div>
          </details>
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
      </div>
    </section>
  );
}
