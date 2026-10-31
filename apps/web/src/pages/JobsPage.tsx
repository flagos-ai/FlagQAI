import { ProjectProvenance } from "../components/ProjectProvenance";
import {
  ExperimentDetails,
  RecordedValues,
} from "../components/ExperimentDetails";
import { SourceVersion } from "../components/SourceVersion";
import { useEffect, useState } from "react";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import { download, jobCSV } from "../state/exports";
export function JobsPage({
  state,
  dispatch,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const [counts, setCounts] = useState(false),
    job = state.jobs.find((j) => j.id === state.selectedJobId) || state.jobs[0],
    [measurementIndex, setMeasurementIndex] = useState(0),
    [batchIndex, setBatchIndex] = useState(0);
  useEffect(() => {
    setMeasurementIndex(0);
    setBatchIndex(0);
  }, [job?.id]);
  const measurement = job?.experiment?.measurements[measurementIndex];
  const savedCounts = measurement?.batches?.[batchIndex] || [];
  const recordedCounts = Object.fromEntries(
    savedCounts.map((row) => [
      row.key_type === "integer" ? row.state + " (integer)" : row.state,
      row.count,
    ]),
  );
  const result =
    job?.result && job.experiment
      ? {
          ...job.result,
          counts: recordedCounts,
          shots: Object.values(recordedCounts).reduce(
            (sum, value) => sum + value,
            0,
          ),
        }
      : job?.result;
  if (!job)
    return (
      <div className="fq-empty">
        <h2>No real jobs yet</h2>
        <p>Execute a model to view its measurements.</p>
        <button
          className="primary"
          onClick={() => dispatch({ type: "navigate", page: "execution" })}
        >
          Configure execution →
        </button>
      </div>
    );
  const entries = Object.entries(result?.counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 32);
  return (
    <section className="fq-jobs">
      <div className="fq-pane-title">RESULTS</div>
      <div className="fq-content-pad">
        <section className="fq-panel">
          <small className="eyebrow">
            {job.experiment
              ? job.experiment.python_run
                ? "PYTHON RESULT · SAVED .FQX"
                : "ARCHIVED RESULT · IMPORTED"
              : result?.backend === "test-only"
                ? "TEST FIXTURE RESULT"
                : "MEASUREMENT RESULT"}{" "}
            · {job.experiment ? "SAVED" : job.status.toUpperCase()}
          </small>
          <h2>{job.name}</h2>
          {job.experiment && <ExperimentDetails info={job.experiment} />}
          <ProjectProvenance project={job.origin?.project} state={state} />
          <SourceVersion
            label={
              job.origin?.language === "python"
                ? "Python source snapshot"
                : job.experiment
                  ? "Saved circuit export"
                  : "Executed from"
            }
            source={job.origin?.source || job.request.source}
            language={job.origin?.language || "qasm"}
            currentSource={state.source}
            currentLanguage={state.language || "qasm"}
          />
          {result ? (
            <>
              {!job.experiment && (
                <p>
                  FlagQuantum {result.version} ·{" "}
                  {result.backend === "test-only"
                    ? "Scripted test adapter"
                    : result.backend === "flagquantum_python"
                      ? "FlagQuantum Python"
                      : "PyTorch CPU"}
                  {result.transport ? " · " + result.transport : ""} ·{" "}
                  {result.elapsed_seconds}s including imports
                </p>
              )}
              <p>
                Job {job.id} · Seed {result.seed ?? "not reported"} ·{" "}
                {result.qubits} qubits
                {result.shots > 0
                  ? ` · ${result.shots} ${job.experiment ? "recorded shots" : "shots"}`
                  : ""}
              </p>
              {job.experiment && (
                <>
                  {job.experiment.measurements.length > 0 ? (
                    <div className="fq-toolbar">
                      <label>
                        Measurement{" "}
                        <select
                          aria-label="Saved measurement"
                          value={measurementIndex}
                          onChange={(event) => {
                            setMeasurementIndex(Number(event.target.value));
                            setBatchIndex(0);
                          }}
                        >
                          {job.experiment.measurements.map((item, index) => (
                            <option key={index} value={index}>
                              {index + 1}. {item.kind} · qubits [
                              {item.qubits.join(", ")}]
                            </option>
                          ))}
                        </select>
                      </label>
                      {measurement?.batches && (
                        <label>
                          Batch{" "}
                          <select
                            aria-label="Saved measurement batch"
                            value={batchIndex}
                            onChange={(event) =>
                              setBatchIndex(Number(event.target.value))
                            }
                          >
                            {measurement.batches.map((_, index) => (
                              <option value={index} key={index}>
                                {index + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  ) : (
                    <p>No measurement outputs were saved in this result.</p>
                  )}
                  {measurement && (
                    <p>
                      Recorded qubit order: [{measurement.qubits.join(", ")}].
                      Keys are shown as saved; integer keys are labeled
                      explicitly.
                    </p>
                  )}
                  {measurement?.value != null && (
                    <pre className="fq-record-value">
                      {JSON.stringify(measurement.value, null, 2)}
                    </pre>
                  )}
                  {measurement && (
                    <details>
                      <summary>Measurement metadata and statistics</summary>
                      <pre>
                        {JSON.stringify(
                          {
                            metadata: measurement.metadata,
                            statistics: measurement.statistics,
                            shots: measurement.shots,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                  <RecordedValues info={job.experiment} />
                </>
              )}
              <div className="fq-toolbar">
                <label className="fq-inline">
                  <input
                    type="checkbox"
                    checked={counts}
                    onChange={(e) => setCounts(e.target.checked)}
                  />{" "}
                  Percentage / Counts
                </label>
                <div className="push" />
                <button
                  className="link"
                  onClick={() =>
                    download(
                      job.name + ".json",
                      JSON.stringify(job, null, 2),
                      "application/json",
                    )
                  }
                >
                  Export as JSON ↗
                </button>
                <button
                  className="link"
                  onClick={() =>
                    download(
                      job.name + ".csv",
                      jobCSV({ ...job, result }),
                      "text/csv",
                    )
                  }
                >
                  Export as CSV ↗
                </button>
              </div>
              {entries.length > 0 && result.shots > 0 && (
                <>
                  <div className="fq-chart">
                    <h3>Measurement Results ({counts ? "Counts" : "%"})</h3>
                    <div className="fq-plot">
                      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((n) => (
                        <div
                          className="fq-gridline"
                          key={n}
                          style={{ bottom: n * 100 + "%" }}
                        >
                          <span>
                            {counts
                              ? Math.round(n * result.shots)
                              : Math.round(n * 100) + "%"}
                          </span>
                        </div>
                      ))}
                      {entries.map(([bits, count], i) => (
                        <div
                          key={bits}
                          className="fq-bar"
                          style={{
                            height: (count / result.shots) * 100 + "%",
                            left: ((i + 0.15) * 100) / entries.length + "%",
                            width: 70 / entries.length + "%",
                          }}
                          title={`${bits}: ${count} shots`}
                        >
                          <span>{bits}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p>
                    Count sum:{" "}
                    {Object.values(result.counts).reduce((a, b) => a + b, 0)} /{" "}
                    {result.shots} ·{" "}
                    {job.experiment ? "recorded measurement order" : "q0 first"}
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>State</th>
                        <th>Counts</th>
                        <th>Probability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(([bits, count]) => (
                        <tr key={bits}>
                          <td>{bits}</td>
                          <td>{count}</td>
                          <td>{((count / result.shots) * 100).toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {Boolean(result.decoded?.length && result.registers?.length) && (
                <>
                  <h3>Decoded registers</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>State</th>
                        {(result.registers || []).map((r) => (
                          <th key={r.name}>{r.name}</th>
                        ))}
                        <th>Counts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.decoded!.map((r) => (
                        <tr key={r.state}>
                          <td>{r.state}</td>
                          {(result.registers || []).map((reg) => (
                            <td key={reg.name}>{r.values[reg.name]}</td>
                          ))}
                          <td>{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : job.status === "failed" ? (
            <p role="alert" className="fq-diagnostic error">
              {job.error || "Execution failed."}
            </p>
          ) : (
            <p role="status">
              Waiting for the remote result. You can leave this page and return.
            </p>
          )}
          <details>
            <summary>Model used for this result</summary>
            <SourceVersion
              label={
                job.origin?.language === "python"
                  ? "Python source snapshot"
                  : job.experiment
                    ? "Saved circuit export"
                    : "Executed from"
              }
              source={job.origin?.source || job.request.source}
              language={job.origin?.language || "qasm"}
              currentSource={state.source}
              currentLanguage={state.language || "qasm"}
            />
            <pre>{job.origin?.source || job.request.source}</pre>
            {job.origin && (
              <details>
                <summary>Generated OpenQASM</summary>
                <pre>{job.request.source}</pre>
              </details>
            )}
            <button
              onClick={() =>
                dispatch({
                  type: "model",
                  model: {
                    name: job.name,
                    source: job.origin?.source || job.request.source,
                    language: job.origin?.language || "qasm",
                  },
                  preserveDraft: true,
                })
              }
            >
              Open source in Model ↗
            </button>
          </details>
        </section>
      </div>
    </section>
  );
}
