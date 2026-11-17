import type {
  ExperimentImport,
  Instruction,
} from "../contracts/quantum-workspace";
import {
  circuitDifference,
  compareDistributions,
  groupedOperationChanges,
} from "../state/experiment-comparison";

function signed(value: number) {
  return value > 0
    ? `+${value}`
    : value === 0
      ? "Unchanged"
      : `−${Math.abs(value)}`;
}
function OperationChanges({
  label,
  prefix,
  instructions,
  indices,
}: {
  label: string;
  prefix: string;
  instructions: Instruction[];
  indices: Set<number>;
}) {
  if (!indices.size) return null;
  return (
    <section className="fq-operation-changes" aria-label={label}>
      <h4>
        {label} · {indices.size}
      </h4>
      <table>
        <thead>
          <tr>
            <th>Operation</th>
            <th>Count</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {groupedOperationChanges(instructions, indices).map(
            ({ gate, indices }) => (
              <tr key={indices[0]}>
                <th>
                  {prefix} {gate.name.toUpperCase()} on{" "}
                  {gate.wires.map((wire) => "q" + wire).join(", ")}
                  {Object.keys(gate.params || {}).length > 0 && (
                    <code>{JSON.stringify(gate.params)}</code>
                  )}
                </th>
                <td>{indices.length}</td>
                <td>{indices.map((index) => `#${index + 1}`).join(", ")}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}
export function ComparisonFindings({
  left,
  right,
  diff,
  comparison,
  warning,
  namedOnly,
}: {
  left: ExperimentImport;
  right: ExperimentImport;
  diff: ReturnType<typeof circuitDifference>;
  comparison: ReturnType<typeof compareDistributions>;
  warning: string | null;
  namedOnly: boolean;
}) {
  const a = left.program.compiled,
    b = right.program.compiled;
  const difference = b.instructions.length - a.instructions.length;
  const conclusion =
    difference === 0
      ? "Same operation count"
      : `${Math.abs(difference)} ${difference < 0 ? "fewer" : "more"} operation${Math.abs(difference) === 1 ? "" : "s"}`;
  const metrics = [
    { label: "Qubits", a: a.qubits, b: b.qubits },
    { label: "Operations", a: a.instructions.length, b: b.instructions.length },
    { label: "Circuit depth", a: a.depth, b: b.depth },
  ];
  return (
    <section
      className="fq-comparison-findings"
      aria-label="Observed differences"
    >
      <small className="eyebrow">A → B · COMPARISON SUMMARY</small>
      <h3>
        {conclusion} ·{" "}
        {a.qubits === b.qubits
          ? "same qubit count"
          : `${signed(b.qubits - a.qubits)} qubits`}
      </h3>
      <table
        className="fq-comparison-resource-table"
        aria-label="Circuit resource comparison"
      >
        <thead>
          <tr>
            <th>Resource</th>
            <th>A · Baseline</th>
            <th>B · Variant</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.label}>
              <th>{metric.label}</th>
              <td>{metric.a.toLocaleString()}</td>
              <td>{metric.b.toLocaleString()}</td>
              <td>{signed(metric.b - metric.a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {namedOnly ? (
        <p>
          See the synthesis report for the recorded named probabilities. No
          saved sample distributions are available.
        </p>
      ) : warning ? (
        <p role="status">{warning}</p>
      ) : comparison ? (
        <p className="fq-comparison-distribution-summary">
          Observed distribution distance:{" "}
          <strong>{(comparison.distance * 100).toFixed(1)}%</strong>{" "}
          <span>
            A: {comparison.totalA.toLocaleString()} counts · B:{" "}
            {comparison.totalB.toLocaleString()} counts
          </span>{" "}
          <small>
            Saved observations · this comparison does not verify correctness.
          </small>
        </p>
      ) : (
        <p>Save non-empty counts on both sides to compare distributions.</p>
      )}
      <details className="fq-comparison-change-details">
        <summary>
          {diff.limited
            ? "Operation matching unavailable · view full circuits"
            : `Gate changes · ${diff.added.size} added · ${diff.removed.size} removed operations`}
        </summary>
        <p className="fq-muted">
          A is the baseline; B is the variant. These resource counts do not
          establish an optimization improvement.
          {comparison &&
            " Distribution distance describes saved samples, not fidelity or a causal explanation; equal counts can hide phase changes."}
        </p>
        {diff.limited ? (
          <p>
            Operation matching is limited to circuits with at most 200
            operations. Open the full circuits to inspect all operations.
          </p>
        ) : (
          <>
            <p>
              Dashed outlines mark changed operations in the previews. Positions
              refer to the complete saved circuit on each side.
            </p>
            {!diff.added.size && !diff.removed.size && (
              <p>No operation changes.</p>
            )}
            <OperationChanges
              label="Added in B"
              prefix="+"
              instructions={b.instructions}
              indices={diff.added}
            />
            <OperationChanges
              label="Removed from A"
              prefix="−"
              instructions={a.instructions}
              indices={diff.removed}
            />
          </>
        )}
      </details>
    </section>
  );
}
