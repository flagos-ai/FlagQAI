import { useState } from "react";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import type { PythonRun } from "../api/python-runs";
import {
  circuitMatchesSource,
  compilationResults,
} from "../state/compilation-results";
import { SynthesisEvidenceCard } from "./SynthesisEvidence";
import { detectedPythonStyle } from "../state/python-style";

export function EditorResultsTabs({
  value,
  onChange,
  outputLabel = "Output",
}: {
  value: "output" | "compilation";
  onChange: (value: "output" | "compilation") => void;
  outputLabel?: string;
}) {
  return (
    <div
      className="fq-editor-result-tabs"
      role="group"
      aria-label="Editor results"
    >
      <button
        aria-pressed={value === "output"}
        onClick={() => onChange("output")}
      >
        {outputLabel}
      </button>
      <button
        aria-pressed={value === "compilation"}
        onClick={() => onChange("compilation")}
      >
        Circuits & resources
      </button>
    </div>
  );
}

export function CompilationResults({
  state,
  dispatch,
  run,
  compilingSource,
  onOutput,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  run?: PythonRun;
  compilingSource: string | null;
  onOutput: () => void;
}) {
  const rows = compilationResults(state, run);
  const python = state.language === "python";
  const current = rows.filter((program) =>
    circuitMatchesSource(state, program),
  );
  const error = state.error?.source === state.source ? state.error : undefined;
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = selected.filter((id) =>
    rows.some((program) => program.id === id),
  );
  const loading =
    python && !!state.pythonRunId && run?.id !== state.pythonRunId;
  const collectionFailed =
    python &&
    !loading &&
    !!run &&
    ["failed", "partial"].includes(run.collection_status || "");
  const status = loading
    ? "Loading selected run…"
    : !python && compilingSource !== null
      ? compilingSource === state.source
        ? "Compiling…"
        : "Compiling another source…"
      : !python && error
        ? "Compilation failed"
        : python && run && ["queued", "running"].includes(run.status)
          ? `Python ${run.status}…`
          : python && run && run.status !== "completed"
            ? `Python ${run.status} · saved circuits retained`
            : collectionFailed
              ? rows.length
                ? "Some circuits could not be collected"
                : "Circuit collection failed"
              : current.length
                ? python
                  ? "Saved circuits available"
                  : "Compiled"
                : rows.length
                  ? "Source changed · previous resources"
                  : python
                    ? "No saved circuit for this source"
                    : "Ready to compile";
  return (
    <section
      className="fq-compilation-results"
      aria-label="Compilation results"
    >
      <header>
        <strong role="status" aria-label="Compilation status">
          {status}
        </strong>
        {python && run && <small>Run {run.id.slice(0, 8)}</small>}
        {chosen.length === 2 && (
          <button
            onClick={() =>
              dispatch({
                type: "compare-experiments",
                left: chosen[0],
                right: chosen[1],
              })
            }
          >
            Compare saved circuits
          </button>
        )}
      </header>
      {!python && error && (
        <p role="alert" className="fq-diagnostic error">
          {error.message}
        </p>
      )}
      {!rows.length && (
        <p className="fq-compilation-empty">
          {collectionFailed
            ? "Python execution and circuit collection have separate statuses. Review the collection errors in Output before deciding whether to run again."
            : python
              ? run?.status === "completed"
                ? "Python completed without a saved circuit. Printed probabilities and resource estimates are available in Output; this source must save an FQX file to make its circuit available here."
                : detectedPythonStyle(state.source) === "synthesis"
                  ? "Set synthesis constraints in this Python source, then Run Python. Save the generated circuit with fq.save to inspect its resources here."
                  : "Run this Python source and save a circuit with fq.save to inspect its resources here."
              : "Use Compile above to generate a circuit from this source."}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="fq-compilation-table">
            <table>
              <thead>
                <tr>
                  <th>Circuit / source version</th>
                  <th>Qubits</th>
                  <th>Depth</th>
                  <th>Gates</th>
                  <th>Explicit T/Tdg</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((program) => {
                  const matches = circuitMatchesSource(state, program);
                  return (
                    <tr key={program.id}>
                      <th scope="row">
                        {program.experiment && (
                          <input
                            type="checkbox"
                            aria-label={`Compare saved circuit ${program.name}`}
                            checked={chosen.includes(program.id)}
                            disabled={
                              chosen.length === 2 &&
                              !chosen.includes(program.id)
                            }
                            onChange={(event) =>
                              setSelected(
                                event.target.checked
                                  ? [...chosen, program.id]
                                  : chosen.filter((id) => id !== program.id),
                              )
                            }
                          />
                        )}
                        <span>
                          {program.experiment?.filename || program.name}
                        </span>
                        <small>
                          {matches
                            ? "Current source"
                            : program.origin?.source === state.source
                              ? "Dependencies changed or unchecked"
                              : "Code changed · saved version"}{" "}
                          · {new Date(program.created).toLocaleTimeString()} ·{" "}
                          {program.origin?.source_hash?.slice(0, 12) ||
                            program.id.slice(0, 8)}
                        </small>
                      </th>
                      <td>{program.compiled.qubits}</td>
                      <td>{program.compiled.depth}</td>
                      <td>{program.compiled.instructions.length}</td>
                      <td>
                        {
                          program.compiled.instructions.filter((gate) =>
                            ["t", "tdg"].includes(gate.name.toLowerCase()),
                          ).length
                        }
                      </td>
                      <td>
                        <button
                          aria-label={`View circuit ${program.name}`}
                          onClick={() => {
                            dispatch({ type: "program", id: program.id });
                            dispatch({ type: "navigate", page: "program" });
                          }}
                        >
                          View circuit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.some((program) => !circuitMatchesSource(state, program)) && (
            <p>
              Saved resources belong to their recorded code versions. Run or
              compile the edited source to produce a new version.
            </p>
          )}
          <small className="fq-compilation-scope">
            T/Tdg counts cover explicit gates; a Clifford+T decomposition is
            required for total T cost.
          </small>
          {rows.map((program) => (
            <SynthesisEvidenceCard key={program.id} program={program} />
          ))}
        </>
      )}
      {python &&
        run &&
        (collectionFailed ||
          run.error ||
          (run.experiments?.length || 0) > rows.length) && (
          <button onClick={onOutput}>View run output and all archives</button>
        )}
    </section>
  );
}
