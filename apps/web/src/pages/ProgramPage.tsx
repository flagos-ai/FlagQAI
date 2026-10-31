import { ProjectProvenance } from "../components/ProjectProvenance";
import { ExperimentDetails } from "../components/ExperimentDetails";
import { SourceVersion } from "../components/SourceVersion";
import { useEffect, useRef, useState } from "react";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import {
  CircuitCanvas,
  type CircuitSelection,
} from "../components/CircuitCanvas";
import { GateReference } from "../components/GateReference";
import { Separator } from "../components/Separator";
import { useStackedPanels } from "../hooks/useStackedPanels";
import { usePanelSize } from "../hooks/usePanelSize";
import {
  numericParameter,
  parameterValue,
  rawParameter,
} from "../state/circuit-scene";
import { download, exportNotebook } from "../state/exports";

export function ProgramPage({
  state,
  dispatch,
  compile,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  compile: () => void;
}) {
  const stacked = useStackedPanels();
  const [selection, setSelection] = useState<CircuitSelection | null>(null),
    [info, setInfo] = useState(true),
    [focus, setFocus] = useState(false),
    [reference, setReference] = useState<string | null>(null);
  const [infoWidth, setInfoWidth] = usePanelSize("programInfo", 300, 230, 500),
    [summaryHeight, setSummaryHeight] = usePanelSize(
      "programSummary",
      290,
      170,
      600,
    );
  const svg = useRef<SVGSVGElement>(null),
    program = state.programs.find((p) => p.id === state.selectedProgramId),
    c = program?.compiled;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  return (
    <div
      className={"fq-program-workspace " + (focus ? "focused" : "")}
      style={{
        gridTemplateColumns:
          info && !focus ? `minmax(0,1fr) 6px ${infoWidth}px` : "minmax(0,1fr)",
      }}
    >
      <section className="fq-visualizer">
        <div className="fq-pane-title">
          VISUALIZATION
          <button
            aria-label="Focus quantum circuit"
            onClick={() => setFocus(!focus)}
          >
            ⛶
          </button>
        </div>
        <div className="fq-toolbar">
          <span>{program?.name || "Quantum Program"}</span>
          {program?.experiment && (
            <small
              className="fq-experiment-time"
              title={`Collected ${new Date(program.experiment.imported_at).toLocaleString()} · ${program.experiment.python_run ? "Python run " + program.experiment.python_run.id : program.id}`}
            >
              {new Date(program.experiment.imported_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              {" · "}
              {(program.experiment.python_run?.id || program.id).slice(-8)}
            </small>
          )}
          <div className="push" />
          <button onClick={() => setInfo(!info)}>Info</button>
          <button onClick={() => setReference("")}>Gate reference</button>
          <button
            disabled={!program}
            aria-label="Download circuit"
            onClick={() =>
              svg.current &&
              download(
                program!.name + ".svg",
                svg.current.outerHTML,
                "image/svg+xml",
              )
            }
          >
            ↓
          </button>
          <button
            className="primary"
            disabled={!program}
            onClick={() => dispatch({ type: "navigate", page: "execution" })}
          >
            {program?.experiment ? "Run again →" : "Execute →"}
          </button>
        </div>
        {c ? (
          <CircuitCanvas
            key={program.id}
            compiled={c}
            zoom={state.zoom}
            onZoom={(zoom) => dispatch({ type: "preferences", zoom })}
            onSelect={setSelection}
            svgRef={svg}
          />
        ) : (
          <div className="fq-empty">
            <div className="fq-empty-circuit">─── H ───⊕───</div>
            <h1>Quantum Circuit Visualizer</h1>
            <p>Compile a model, upload OpenQASM or import a .fqx experiment.</p>
            <button className="primary" disabled={state.busy} onClick={compile}>
              Compile current model →
            </button>
            <button
              onClick={() => dispatch({ type: "navigate", page: "model" })}
            >
              Back to Model
            </button>
          </div>
        )}
      </section>
      {info && !focus && (
        <>
          <Separator
            label="Resize program information"
            reverse
            orientation={stacked ? "horizontal" : "vertical"}
            value={infoWidth}
            onChange={setInfoWidth}
            min={230}
            max={500}
            initial={300}
          />
          <aside
            className="fq-program-info"
            style={stacked ? { height: infoWidth + 100 } : undefined}
          >
            <div className="fq-pane-title">
              PROGRAM INFO
              <button
                aria-label="Collapse program information"
                onClick={() => setInfo(false)}
              >
                ×
              </button>
            </div>
            <section
              className="fq-program-summary"
              style={{ height: summaryHeight }}
            >
              {program && c ? (
                <>
                  <h3>{program.name}</h3>
                  {program.experiment && (
                    <>
                      <ExperimentDetails info={program.experiment} />
                      {program.experiment.has_result && (
                        <button
                          className="primary"
                          onClick={() => {
                            dispatch({ type: "job", id: program.id });
                            dispatch({ type: "navigate", page: "jobs" });
                          }}
                        >
                          View saved result →
                        </button>
                      )}
                    </>
                  )}
                  <ProjectProvenance
                    project={program.origin?.project}
                    state={state}
                  />
                  <SourceVersion
                    label={
                      program.origin?.language === "python"
                        ? "Python source snapshot"
                        : program.experiment
                          ? "Saved circuit export"
                          : "Compiled from"
                    }
                    source={program.origin?.source || program.source}
                    language={program.origin?.language || "qasm"}
                    currentSource={state.source}
                    currentLanguage={state.language || "qasm"}
                  />
                  <div className="fq-metrics">
                    {[
                      [c.qubits, "QUBITS"],
                      [c.depth, "COMPILED DEPTH"],
                      [c.instructions.length, "COMPILED GATES"],
                    ].map(([value, label]) => (
                      <div key={label}>
                        <b>{value}</b>
                        <small>{label}</small>
                      </div>
                    ))}
                  </div>
                  <p>
                    {program.experiment ? "Saved with" : "Compiler"}{" "}
                    <b>FlagQuantum {c.version}</b>
                  </p>
                  <p>
                    Backend{" "}
                    <b>
                      {c.backend === "test-only"
                        ? "Scripted test adapter"
                        : c.backend === "fqx_archive"
                          ? "Archived experiment"
                          : c.backend === "flagquantum_python"
                            ? "FlagQuantum Python"
                            : "PyTorch CPU"}
                    </b>
                  </p>
                  <button
                    onClick={() =>
                      dispatch({
                        type: "model",
                        model: {
                          name: program.name,
                          source: program.origin?.source || program.source,
                          language: program.origin?.language || "qasm",
                        },
                        preserveDraft: true,
                      })
                    }
                  >
                    Open source in Model ↗
                  </button>
                  <button
                    className="link"
                    onClick={() =>
                      download(program.name + ".qasm", program.source)
                    }
                  >
                    Download OpenQASM ↓
                  </button>
                  <button
                    className="link"
                    onClick={() =>
                      exportNotebook(program, state.shots, state.seed)
                    }
                  >
                    Export notebook ↓
                  </button>
                </>
              ) : (
                <p>
                  Program resources and source information appear after
                  compilation.
                </p>
              )}
            </section>
            <Separator
              label="Resize program summary and node details"
              orientation="horizontal"
              value={summaryHeight}
              onChange={setSummaryHeight}
              min={170}
              max={600}
              initial={290}
            />
            <section className="fq-node-details">
              <small className="eyebrow">SELECTED NODE</small>
              {selection ? (
                "module" in selection ? (
                  <>
                    <h3>{selection.module.label}</h3>
                    {[
                      ["Gates", selection.module.gate_count],
                      ["Active qubits", selection.module.wires.length],
                      ["Source depth", selection.module.depth],
                      ["Children", selection.module.children.length],
                      [
                        "Source",
                        `Lines ${selection.module.source_start || "—"}–${selection.module.source_end || "—"}`,
                      ],
                    ].map(([name, value]) => (
                      <p key={name}>
                        {name}
                        <b>{value}</b>
                      </p>
                    ))}
                    <pre>
                      {JSON.stringify(selection.module.gate_counts, null, 2)}
                    </pre>
                  </>
                ) : "gate" in selection ? (
                  <>
                    <h3>{selection.gate.name.toUpperCase()}</h3>
                    <button
                      className="link"
                      onClick={() =>
                        setReference(selection.gate.name.toLowerCase())
                      }
                    >
                      View gate reference ↗
                    </button>
                    <p>Qubits: {selection.gate.wires.join(", ")}</p>
                    <p>
                      Source line:{" "}
                      {selection.gate.line || "Unavailable after optimization"}
                    </p>
                    {Object.keys(selection.gate.params || {}).length > 0 && (
                      <div className="fq-parameter-details">
                        <h3>Parameters</h3>
                        {Object.entries(selection.gate.params || {}).map(
                          ([name, value]) => (
                            <div key={name}>
                              <p>
                                <b>{name}</b>
                                <span>{parameterValue(value)}</span>
                              </p>
                              <small>
                                Exact
                                {numericParameter(value) !== null
                                  ? " · radians"
                                  : " · expression"}
                              </small>
                              <code>{rawParameter(value)}</code>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p>Measurement · q{selection.measurement}</p>
                    <button
                      className="link"
                      onClick={() => setReference("measure")}
                    >
                      View measurement reference ↗
                    </button>
                  </>
                )
              ) : (
                <p>
                  Expand a module with ＋ or select a gate to inspect its
                  operands and source.
                </p>
              )}
              <details>
                <summary>OpenQASM snapshot</summary>
                <pre>{program?.source || "No program selected."}</pre>
              </details>
              {program?.origin && (
                <details>
                  <summary>Original Python source</summary>
                  <pre>{program.origin.source}</pre>
                </details>
              )}
            </section>
          </aside>
        </>
      )}
      {reference !== null && (
        <GateReference
          initialGate={reference}
          onClose={() => setReference(null)}
        />
      )}
    </div>
  );
}
