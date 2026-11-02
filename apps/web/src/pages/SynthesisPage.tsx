import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import { UIIcon } from "../components/UIIcon";

export function SynthesisPage({
  state,
  dispatch,
  compile,
  compilingSource,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  compile: () => void;
  compilingSource: string | null;
}) {
  const python = state.language === "python";
  const current = state.programs.find((program) =>
    python
      ? program.origin?.language === "python" &&
        program.origin.source === state.source
      : program.source === state.source,
  );
  const previous =
    !python && !current
      ? state.programs.find(
          (program) => !program.experiment && program.name === state.name,
        )
      : undefined;
  const result = current || previous;
  const error = state.error?.source === state.source ? state.error : null;
  const compiling = compilingSource !== null;
  const status = compiling
    ? compilingSource === state.source
      ? "Compiling…"
      : "Compiling another source…"
    : python
      ? current
        ? "Saved circuit available"
        : "Python runs in Model"
      : error
        ? "Compilation failed"
        : current
          ? current.experiment
            ? "Saved circuit available"
            : "Compiled"
          : state.busy
            ? "Another operation is in progress"
            : "Ready to compile";
  const openModel = () => dispatch({ type: "navigate", page: "model" });
  return (
    <section
      className="fq-synthesis fq-synthesis-compact"
      aria-label="Synthesis workspace"
    >
      <div className="fq-toolbar fq-synthesis-toolbar">
        <span className="fq-synthesis-identity">
          <strong>{state.name}</strong>
          <small>{python ? "Python" : "OpenQASM"}</small>
        </span>
        <div className="push" />
        {!python && <button onClick={openModel}>Edit model</button>}
        <button
          className="primary"
          disabled={state.busy}
          onClick={python ? openModel : compile}
        >
          <UIIcon
            name={compiling ? "refresh" : python ? "code" : "play"}
            className={compiling ? "fq-ui-busy" : ""}
            size={14}
          />
          {python
            ? "Open Python in Model"
            : compiling
              ? "Compiling…"
              : "Compile model →"}
        </button>
      </div>
      <div className="fq-synthesis-content">
        <div
          className={
            "fq-synthesis-status " +
            (compiling
              ? "working"
              : error && !python
                ? "failed"
                : current
                  ? "completed"
                  : "ready")
          }
          role="status"
          aria-label="Compilation status"
        >
          <UIIcon
            name={
              compiling
                ? "refresh"
                : error && !python
                  ? "info"
                  : current
                    ? "check"
                    : "code"
            }
            size={16}
            className={compiling ? "fq-ui-busy" : ""}
          />
          <strong>{status}</strong>
        </div>
        {!compiling && (
          <p className="fq-synthesis-hint">
            {python
              ? "Run this file in Model to save a circuit for Quantum."
              : error
                ? "Review the compiler error, edit the model and retry."
                : current
                  ? "This circuit matches the current model source."
                  : previous
                    ? "The model has changed. Compile again to update its circuit."
                    : "Compile the current model to inspect its circuit and resources."}
          </p>
        )}
        {error && !python && !compiling && (
          <p className="fq-diagnostic error" role="alert">
            {error.message}
          </p>
        )}
        {result && (
          <section
            className={"fq-synthesis-result " + (previous ? "previous" : "")}
            aria-label={
              previous ? "Previous compilation" : "Compilation result"
            }
          >
            <header>
              <div>
                <h2>
                  {previous ? "Previous compilation" : "Circuit resources"}
                </h2>
                <small>
                  {result.name} · {new Date(result.created).toLocaleString()}
                </small>
              </div>
              <button
                onClick={() => {
                  dispatch({ type: "program", id: result.id });
                  dispatch({ type: "navigate", page: "program" });
                }}
              >
                {previous ? "View previous circuit" : "Open circuit"}{" "}
                <UIIcon name="arrow" size={14} />
              </button>
            </header>
            {previous && (
              <p className="fq-synthesis-stale">
                Source differs from the current model. These resources belong to
                the previous compilation.
              </p>
            )}
            {compiling && (
              <p className="fq-synthesis-stale">
                Showing the saved circuit while compilation is in progress.
              </p>
            )}
            {error && !python && !compiling && (
              <p className="fq-synthesis-stale">
                These are saved resources. The latest compilation failed.
              </p>
            )}
            <dl className="fq-synthesis-metrics">
              {[
                ["Qubits", result.compiled.qubits],
                ["Depth", result.compiled.depth],
                ["Gates", result.compiled.instructions.length],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <small>FlagQuantum {result.compiled.version}</small>
          </section>
        )}
      </div>
    </section>
  );
}
