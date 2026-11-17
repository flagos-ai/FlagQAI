import type { ProgramSnapshot } from "../contracts/quantum-workspace";
import {
  compareSynthesis,
  programSynthesis,
  synthesisIteration,
  synthesisModules,
  type SynthesisEvidence,
} from "../state/synthesis-evidence";

export function SynthesisEvidenceCard({
  program,
}: {
  program: ProgramSnapshot;
}) {
  const evidence = programSynthesis(program);
  if (!evidence) return null;
  const modules = synthesisModules(program.compiled);
  const { report, checks } = evidence,
    r = report.resources;
  const passed =
    checks.saved_circuit_replay &&
    checks.max_probability_error <= checks.tolerance;
  return (
    <section
      className="fq-synth-evidence"
      aria-label="Recorded synthesis report"
    >
      <header>
        <strong>{evidence.label} · Synthesis report</strong>
        <span>
          {passed ? "Script checks passed" : "Script checks incomplete"}
        </span>
      </header>
      <p>
        {r.n_qubits} qubits · {r.n_operations} operations · Depth {r.depth} ·{" "}
        {report.workspace_qubits} workspace qubits
      </p>
      <p>
        {evidence.problem} · {evidence.outcomes.length} named outcomes
      </p>
      <details>
        <summary>Constraints, named outputs and evidence</summary>
        <p>
          The source script recorded these checks.{" "}
          {program.origin?.source_hash
            ? "Bound to this run’s source and saved circuit."
            : "Original source is not available for checking this imported report."}
        </p>
        <p>
          Saved circuit replay:{" "}
          {checks.saved_circuit_replay ? "passed in script" : "not confirmed"}.
          Probability error: {checks.max_probability_error.toExponential(2)}.
        </p>
        <table>
          <thead>
            <tr>
              {evidence.register_names.map((name) => (
                <th key={name}>{name}</th>
              ))}
              <th>Probability</th>
            </tr>
          </thead>
          <tbody>
            {evidence.outcomes.map((row) => (
              <tr key={row.values.join(":")}>
                {row.values.map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
                <td>{(row.probability * 100).toFixed(4)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Explicit T/Tdg gates: {r.t_count}. Clifford+T costs require a separate
          decomposition.
        </p>
        {modules.length > 0 && (
          <table>
            <caption>
              Compiler operations · each executable gate counted once
            </caption>
            <thead>
              <tr>
                <th>Operation</th>
                <th>Gates</th>
                <th>Wires touched</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  <td>{row.gates}</td>
                  <td>{row.wires}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <pre>
          {JSON.stringify(
            {
              constraints: evidence.constraints,
              sdk_version: evidence.sdk_version,
              sdk_code_sha256: evidence.sdk_code_sha256,
              synthesis_module_sha256: evidence.synthesis_module_sha256,
              source_sha256: evidence.source_sha256,
              program_hash: evidence.program_hash,
              report: evidence.report,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}

export function SynthesisComparison({
  a,
  b,
}: {
  a: SynthesisEvidence | null;
  b: SynthesisEvidence | null;
}) {
  if (!a && !b) return null;
  const compared = a && b ? compareSynthesis(a, b) : null;
  const iteration =
    a && b
      ? a.iteration?.role === "candidate"
        ? synthesisIteration(b, a)
        : synthesisIteration(a, b)
      : null;
  const optimization = !!(a?.iteration || b?.iteration);
  return (
    <section
      className="fq-synth-evidence"
      aria-label="Synthesis report comparison"
    >
      <strong>
        {optimization
          ? "Synthesis optimization comparison"
          : "Synthesis report comparison"}
      </strong>
      {optimization && (
        <p>
          <strong>
            {iteration?.verdict ?? "Baseline binding unavailable"}
          </strong>
          {iteration?.passed &&
            " · Script verified the prepared state and replay"}
        </p>
      )}
      {compared ? (
        <>
          <p>
            B − A: {compared.qubits} qubits ·{" "}
            {compared.operations > 0 ? "+" : ""}
            {compared.operations} operations · {compared.depth > 0 ? "+" : ""}
            {compared.depth} depth
          </p>
          <p>
            Maximum recorded named-probability difference:{" "}
            {compared.max_probability_difference.toExponential(2)}.
          </p>
          <details>
            <summary>All recorded constraints</summary>
            <pre>
              {JSON.stringify(
                { A: a!.constraints, B: b!.constraints },
                null,
                2,
              )}
            </pre>
          </details>
          {optimization && (
            <p>
              The prepared-state check covers the inputs defined in the saved
              script.
            </p>
          )}
        </>
      ) : (
        <p>
          Reports have different problems, SDK identities or incomplete
          bindings. Named results cannot be compared reliably.
        </p>
      )}
    </section>
  );
}
