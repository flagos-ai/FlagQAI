import { useEffect, useState } from "react";
import {
  listExperiments,
  readExperiment,
  experimentFileURL,
} from "../api/experiments";
import type {
  ExperimentImport,
  ProgramSnapshot,
  WorkspaceState,
  WorkspaceAction,
} from "../contracts/quantum-workspace";
import {
  compareDistributions,
  comparisonMeasurements,
  measurementCompatibility,
  circuitDifference,
} from "../state/experiment-comparison";
import { GateSymbol, MeasurementSymbol } from "./CircuitSymbols";
import { UIIcon } from "./UIIcon";

function CircuitPreview({
  program,
  changed,
  onOpen,
}: {
  program: ProgramSnapshot;
  changed: Set<number>;
  onOpen: () => void;
}) {
  const all = program.compiled.instructions,
    gates = all.slice(0, 16);
  const wires = Math.min(program.compiled.qubits, 6),
    width = Math.max(300, 100 + gates.length * 66),
    height = 32 + wires * 76;
  const y = (wire: number) => 42 + wire * 76;
  return (
    <div className="fq-compare-circuit">
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={program.name + " circuit preview"}
      >
        {Array.from({ length: wires }, (_, wire) => (
          <g key={wire}>
            <text x={12} y={y(wire) + 4} fill="#aeb5c0" fontSize={11}>
              q{wire}
            </text>
            <line
              x1={40}
              x2={width - 12}
              y1={y(wire)}
              y2={y(wire)}
              stroke="#737985"
              strokeWidth={1}
            />
          </g>
        ))}
        {gates.map((gate, index) => {
          if (!gate.wires.length || gate.wires.some((wire) => wire >= wires))
            return null;
          const x = 70 + index * 66;
          return (
            <g key={index}>
              {changed.has(index) && (
                <rect
                  x={x - 25}
                  y={Math.min(...gate.wires.map(y)) - 27}
                  width={50}
                  height={
                    Math.max(...gate.wires.map(y)) -
                    Math.min(...gate.wires.map(y)) +
                    54
                  }
                  rx={8}
                  fill="none"
                  stroke="#7cc9ff"
                  strokeDasharray="3 3"
                />
              )}
              {gate.name.toLowerCase() === "measure" ? (
                gate.wires.map((wire) => (
                  <MeasurementSymbol
                    key={wire}
                    x={x}
                    y={y(wire)}
                    label={"q" + wire}
                    wires={[wire]}
                    onSelect={onOpen}
                  />
                ))
              ) : (
                <GateSymbol
                  gate={gate}
                  index={index}
                  x={x}
                  width={54}
                  y={y}
                  bus={false}
                  onSelect={onOpen}
                />
              )}
            </g>
          );
        })}
      </svg>
      {(all.length > 16 || program.compiled.qubits > 6) && (
        <small>
          Preview: first 16 operations and 6 qubits. Open the full circuit for
          all operations.
        </small>
      )}
    </div>
  );
}
export function ExperimentComparison({
  state,
  dispatch,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const pair = state.comparison!;
  const [records, setRecords] = useState<ExperimentImport[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [leftMeasure, setLeftMeasure] = useState(0),
    [rightMeasure, setRightMeasure] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setLeftMeasure(0);
    setRightMeasure(0);
    void Promise.all([
      listExperiments(),
      readExperiment(pair.left),
      readExperiment(pair.right),
    ])
      .then(([list, left, right]) => {
        if (!live) return;
        setRecords([
          ...new Map(
            [...list, left, right].map((record) => [record.id, record]),
          ).values(),
        ]);
        dispatch({ type: "import-experiment", record: left });
        dispatch({ type: "import-experiment", record: right });
        setLoading(false);
      })
      .catch((problem) => {
        if (live) {
          setError(String(problem));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [pair.left, pair.right, dispatch, retry]);
  const left = records.find((record) => record.id === pair.left),
    right = records.find((record) => record.id === pair.right);
  const lm = left?.job ? comparisonMeasurements(left.job) : [],
    rm = right?.job ? comparisonMeasurements(right.job) : [];
  const a = lm[leftMeasure],
    b = rm[rightMeasure];
  const warning =
    measurementCompatibility(a?.measurement, b?.measurement) ||
    (a &&
    b &&
    JSON.stringify([...new Set(a.rows.map((row) => row.key_type))].sort()) !==
      JSON.stringify([...new Set(b.rows.map((row) => row.key_type))].sort())
      ? "State encodings differ. Distributions are shown independently."
      : null);
  const comparison =
    !warning && a && b ? compareDistributions(a.rows, b.rows) : null;
  const diff = circuitDifference(
    left?.program.compiled.instructions || [],
    right?.program.compiled.instructions || [],
  );
  const operationChanges = [
    ...[...diff.added].slice(0, 8).map((index) => {
      const gate = right!.program.compiled.instructions[index];
      return `+ ${gate.name.toUpperCase()} on ${gate.wires.map((wire) => "q" + wire).join(", ")}`;
    }),
    ...[...diff.removed].slice(0, 8).map((index) => {
      const gate = left!.program.compiled.instructions[index];
      return `− ${gate.name.toUpperCase()} on ${gate.wires.map((wire) => "q" + wire).join(", ")}`;
    }),
  ].join(" · ");
  const choices = records.filter(
    (record) => record.job && record.program.experiment?.has_result,
  );
  const openCircuit = (record: ExperimentImport) => {
    dispatch({ type: "import-experiment", record });
    dispatch({ type: "program", id: record.id });
    dispatch({ type: "navigate", page: "program" });
  };
  return (
    <section
      className="fq-jobs fq-comparison"
      aria-label="Experiment comparison"
    >
      <div className="fq-pane-title">
        EXPERIMENT COMPARISON{" "}
        <button onClick={() => dispatch({ type: "compare-experiments" })}>
          Single result
        </button>
      </div>
      <div className="fq-comparison-body">
        <header>
          <div>
            <small className="eyebrow">SAVED EXPERIMENTS</small>
            <h2>See what changed.</h2>
            <p>
              Compare recorded circuits and measurements. Your editor stays
              unchanged.
            </p>
          </div>
          <button
            aria-label="Swap comparison sides"
            onClick={() =>
              dispatch({
                type: "compare-experiments",
                left: pair.right,
                right: pair.left,
              })
            }
          >
            Swap A / B
          </button>
        </header>
        {error && (
          <p role="alert">
            Could not load comparison. {error}{" "}
            <button onClick={() => setRetry((value) => value + 1)}>
              Retry comparison
            </button>
          </p>
        )}
        {loading ? (
          <p role="status">Loading saved experiments…</p>
        ) : (
          <>
            <div className="fq-comparison-grid">
              {[
                {
                  record: left,
                  id: pair.left,
                  other: pair.right,
                  title: "A · Baseline",
                  measures: lm,
                  selected: leftMeasure,
                  select: setLeftMeasure,
                  changed: diff.removed,
                },
                {
                  record: right,
                  id: pair.right,
                  other: pair.left,
                  title: "B · Variant",
                  measures: rm,
                  selected: rightMeasure,
                  select: setRightMeasure,
                  changed: diff.added,
                },
              ].map((side, index) => {
                const record = side.record,
                  measurement = side.measures[side.selected];
                if (!record)
                  return <p key={index}>Saved experiment unavailable.</p>;
                const total =
                  measurement?.rows.reduce((sum, row) => sum + row.count, 0) ||
                  0;
                return (
                  <article
                    className="fq-comparison-card"
                    key={index}
                    aria-label={
                      index ? "Variant experiment" : "Baseline experiment"
                    }
                  >
                    <label>
                      {side.title}
                      <select
                        aria-label={
                          index ? "Variant experiment" : "Baseline experiment"
                        }
                        value={side.id}
                        onChange={(event) =>
                          dispatch({
                            type: "compare-experiments",
                            left: index ? pair.left : event.target.value,
                            right: index ? event.target.value : pair.right,
                          })
                        }
                      >
                        {choices.map((choice) => (
                          <option
                            value={choice.id}
                            key={choice.id}
                            disabled={choice.id === side.other}
                          >
                            {choice.program.name} ·{" "}
                            {choice.program.origin?.run_id?.slice(0, 8) ||
                              choice.id.slice(-8)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="fq-comparison-meta">
                      <span>
                        {record.program.compiled.qubits} qubits ·{" "}
                        {record.program.compiled.instructions.length} gates
                      </span>
                      <button onClick={() => openCircuit(record)}>
                        Open circuit <UIIcon name="arrow" size={12} />
                      </button>
                    </div>
                    <CircuitPreview
                      program={record.program}
                      changed={side.changed}
                      onOpen={() => openCircuit(record)}
                    />
                    <label>
                      Recorded measurement
                      <select
                        aria-label={
                          index ? "Variant measurement" : "Baseline measurement"
                        }
                        value={side.selected}
                        onChange={(event) =>
                          side.select(Number(event.target.value))
                        }
                      >
                        {side.measures.map((item, i) => (
                          <option value={i} key={i}>
                            {item.measurement.kind} · q[
                            {item.measurement.qubits.join(", ")}] · batch{" "}
                            {item.batch + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!measurement || !total ? (
                      <p>No non-empty counts batch saved.</p>
                    ) : (
                      <>
                        <div
                          className="fq-compare-bars"
                          aria-label={
                            index
                              ? "Variant distribution"
                              : "Baseline distribution"
                          }
                        >
                          {[...measurement.rows]
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 12)
                            .map((row) => (
                              <div key={row.key_type + row.state}>
                                <code>
                                  {row.state}
                                  {row.key_type === "integer" ? " (int)" : ""}
                                </code>
                                <span>
                                  <i
                                    style={{
                                      width: (row.count / total) * 100 + "%",
                                    }}
                                  />
                                </span>
                                <strong>
                                  {((row.count / total) * 100).toFixed(1)}%
                                </strong>
                              </div>
                            ))}
                        </div>
                        <small>
                          {total.toLocaleString()} recorded counts · common
                          0–100% scale
                          {measurement.rows.length > 12
                            ? " · top 12 states"
                            : ""}
                        </small>
                      </>
                    )}
                    <details>
                      <summary>Source and provenance</summary>
                      <p>
                        File: {record.program.experiment?.filename} · SHA-256:{" "}
                        {record.program.experiment?.sha256}
                      </p>
                      <p>
                        Run:{" "}
                        {record.program.origin?.run_id || "Independent import"}{" "}
                        · Source:{" "}
                        {record.program.origin?.source_hash || "Not recorded"}
                      </p>
                      <a href={experimentFileURL(record.id)}>
                        Download original .fqx
                      </a>
                      <pre>
                        {record.program.origin?.source || record.program.source}
                      </pre>
                    </details>
                  </article>
                );
              })}
            </div>
            {left && right && (
              <section
                className="fq-comparison-findings"
                aria-label="Observed differences"
              >
                <small className="eyebrow">OBSERVED DIFFERENCES</small>
                <h3>
                  {diff.limited
                    ? "Open full circuits to inspect operation differences"
                    : `${diff.added.size} added · ${diff.removed.size} removed operations`}
                </h3>
                <p>
                  {diff.limited
                    ? "Operation matching is limited to circuits with at most 200 operations."
                    : operationChanges || "No operation changes."}{" "}
                  Dashed outlines mark changed operations.
                </p>
                {warning ? (
                  <p role="status">{warning}</p>
                ) : comparison ? (
                  <>
                    <p>
                      Observed distribution distance:{" "}
                      <strong>{(comparison.distance * 100).toFixed(1)}%</strong>{" "}
                      · A: {comparison.totalA} counts · B: {comparison.totalB}{" "}
                      counts
                    </p>
                    <p className="fq-muted">
                      This describes these saved samples. It does not establish
                      fidelity or a causal explanation; equal counts can hide
                      phase changes.
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>State</th>
                          <th>A</th>
                          <th>B</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.rows.slice(0, 32).map((row) => (
                          <tr key={row.keyType + row.state}>
                            <td>
                              {row.state}
                              {row.keyType === "integer" ? " (int)" : ""}
                            </td>
                            <td>{(row.pa * 100).toFixed(1)}%</td>
                            <td>{(row.pb * 100).toFixed(1)}%</td>
                            <td>
                              {row.delta > 0 ? "+" : ""}
                              {(row.delta * 100).toFixed(1)} pp
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {comparison.rows.length > 32 && (
                      <small>Showing 32 states with the largest changes.</small>
                    )}
                  </>
                ) : (
                  <p>
                    Save non-empty counts on both sides to compare
                    distributions.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
