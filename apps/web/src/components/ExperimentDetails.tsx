import { experimentFileURL } from "../api/experiments";
import type { ExperimentInfo } from "../contracts/quantum-workspace";

export function ExperimentDetails({ info }: { info: ExperimentInfo }) {
  return (
    <section className="fq-experiment-banner">
      <small className="eyebrow">
        {info.python_run
          ? "PYTHON EXPERIMENT · .fqx"
          : "IMPORTED EXPERIMENT · .fqx"}
      </small>
      <p>
        {info.filename} ·{" "}
        {info.python_run
          ? `Saved by ${info.python_run.execution_status} Python run · ${info.has_result ? "recorded result" : "circuit only"}`
          : info.has_result
            ? "Recorded result · no execution performed"
            : "Circuit only · no result saved"}
      </p>
      <a
        className="link"
        href={experimentFileURL(info.id)}
        download={info.filename}
      >
        Download original .fqx ↓
      </a>
      <details>
        <summary>Experiment identity and recorded configuration</summary>
        <p>Saved with FlagQuantum {info.producer_version}</p>
        <p>Imported {new Date(info.imported_at).toLocaleString()}</p>
        <p>
          {info.python_run
            ? "This artifact is linked to the immutable Python source snapshot of its run. The original .fqx archive contains the circuit and result."
            : "Original Python source is not included. Model shows an OpenQASM export of the saved circuit."}
        </p>
        <pre>
          {JSON.stringify(
            {
              python_run: info.python_run,
              file_sha256: info.sha256,
              program_hash: info.program_hash,
              execution_plan: info.execution_plan,
              accuracy: info.accuracy,
              runtime: info.runtime,
              provenance: info.provenance,
              metrics: info.metrics,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}

export function RecordedValues({ info }: { info: ExperimentInfo }) {
  const values = [
    ["Returned value", info.value],
    ["Recorded state", info.state],
    ["Recorded samples", info.samples],
  ].filter(([, value]) => value != null);
  return (
    <>
      {values.map(([label, value]) => (
        <details className="fq-record-value" key={String(label)}>
          <summary>{String(label)}</summary>
          <p>
            Complex amplitudes use [real, imaginary]. Previews show up to 1024
            elements; download the original file for complete data.
          </p>
          <pre>{JSON.stringify(value, null, 2)}</pre>
        </details>
      ))}
    </>
  );
}
