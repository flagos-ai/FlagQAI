import { useId, useState } from "react";
import {
  CircuitPreview,
  ExperimentComparison,
} from "../components/ExperimentComparison";
import { ProjectProvenance } from "../components/ProjectProvenance";
import {
  ExperimentDetails,
  RecordedValues,
} from "../components/ExperimentDetails";
import { SourceVersion } from "../components/SourceVersion";
import { CodeExample } from "../components/CodeExample";
import { UIIcon } from "../components/UIIcon";
import type {
  QuantumJob,
  WorkspaceAction,
  WorkspaceState,
  ProgramSnapshot,
} from "../contracts/quantum-workspace";
import { download, jobCSV } from "../state/exports";
import {
  distributionRows,
  jobCounts,
  jobStatus,
} from "../state/job-presentation";

type Props = {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
};
export function JobsPage({ state, dispatch }: Props) {
  const job =
    state.jobs.find((item) => item.id === state.selectedJobId) || state.jobs[0];
  if (state.comparison)
    return <ExperimentComparison state={state} dispatch={dispatch} />;
  if (!job)
    return (
      <div className="fq-empty">
        <h2>Your results, in one place</h2>
        <p>Run a model or import a saved experiment to explore its results.</p>
        <button
          className="primary"
          onClick={() => dispatch({ type: "navigate", page: "model" })}
        >
          Open Model →
        </button>
      </div>
    );
  return (
    <JobResults key={job.id} job={job} state={state} dispatch={dispatch} />
  );
}
function JobResults({ job, state, dispatch }: Props & { job: QuantumJob }) {
  const id = useId();
  const [tab, setTab] = useState("results");
  const [counts, setCounts] = useState(false);
  const [view, setView] = useState("chart");
  const [sort, setSort] = useState<"probability" | "state">("probability");
  const [page, setPage] = useState(0);
  const [measurementIndex, setMeasurementIndex] = useState(0);
  const [batchIndex, setBatchIndex] = useState(0);
  const measurement = job.experiment?.measurements[measurementIndex];
  const recorded = jobCounts(job, measurementIndex, batchIndex);
  const total = Object.values(recorded).reduce((sum, count) => sum + count, 0);
  const result =
    job.result && job.experiment
      ? { ...job.result, counts: recorded, shots: total }
      : job.result;
  const rows = distributionRows(recorded, sort);
  const lastPage = Math.max(0, Math.ceil(rows.length / 32) - 1);
  const currentPage = Math.min(page, lastPage);
  const entries = rows.slice(currentPage * 32, (currentPage + 1) * 32);
  const source = job.origin?.source || job.request.source;
  const language = job.origin?.language || "qasm";
  const program: ProgramSnapshot | undefined =
    state.programs.find((item) =>
      job.experiment
        ? item.experiment?.id === job.experiment.id
        : item.source === job.request.source,
    ) ||
    (result
      ? {
          id: `job-circuit:${job.id}`,
          name: job.name,
          source: job.request.source,
          compiled: result,
          created: job.experiment?.imported_at || Date.now(),
          origin: job.origin,
          experiment: job.experiment,
        }
      : undefined);
  const openCircuit = () => {
    if (!program) return;
    dispatch({ type: "import-agent-program", program });
    dispatch({ type: "program", id: program.id });
    dispatch({ type: "navigate", page: "program" });
  };
  const elapsed =
    job.experiment?.python_run?.elapsed_seconds ?? result?.elapsed_seconds;
  return (
    <section className="fq-jobs fq-jobs-redesign" aria-label="Job results">
      <div className="fq-pane-title">RESULTS</div>
      <div className="fq-job-content">
        <header className="fq-job-heading">
          <div>
            <span className="fq-job-status">
              <i className={"fq-job-dot " + job.status} />
              {jobStatus(job)}
              {job.experiment && (
                <span>
                  {" "}
                  · {job.experiment.python_run ? "Python" : "Imported .fqx"}
                </span>
              )}
            </span>
            <h1>{job.name}</h1>
            {job.experiment && (
              <p>
                Added {new Date(job.experiment.imported_at).toLocaleString()}
              </p>
            )}
          </div>
          <details className="fq-job-export">
            <summary>
              <UIIcon name="download" size={14} />
              Export
            </summary>
            <div>
              <button
                onClick={() =>
                  download(
                    job.name + ".json",
                    JSON.stringify(job, null, 2),
                    "application/json",
                  )
                }
              >
                JSON
              </button>
              <button
                disabled={!result}
                onClick={() =>
                  result &&
                  download(
                    job.name + ".csv",
                    jobCSV({ ...job, result }),
                    "text/csv",
                  )
                }
              >
                CSV · selected measurement
              </button>
            </div>
          </details>
        </header>
        {result && (
          <dl className="fq-job-metrics">
            <div>
              <dt>Qubits</dt>
              <dd>{result.qubits}</dd>
            </div>
            <div>
              <dt>{job.experiment ? "Recorded shots" : "Shots"}</dt>
              <dd>
                {job.experiment && !measurement?.batches
                  ? "—"
                  : (job.experiment ? total : result.shots).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Observed states</dt>
              <dd>
                {job.experiment && !measurement?.batches
                  ? "—"
                  : rows.length.toLocaleString()}
              </dd>
            </div>
            {elapsed != null && (
              <div>
                <dt>{job.experiment ? "Python run" : "Execution"}</dt>
                <dd>
                  {elapsed.toFixed(2)}
                  <small> s</small>
                </dd>
              </div>
            )}
          </dl>
        )}
        <nav className="fq-job-tabs" aria-label="Result sections">
          {["results", "circuit", "code"].map((item) => (
            <button
              key={item}
              aria-pressed={tab === item}
              aria-controls={id + "-panel"}
              onClick={() => setTab(item)}
            >
              {item === "results"
                ? "Results"
                : item === "circuit"
                  ? "Circuit"
                  : "Code"}
            </button>
          ))}
        </nav>
        <div id={id + "-panel"} className="fq-job-tab-content">
          {tab === "results" && (
            <>
              {job.status === "failed" ? (
                <div role="alert" className="fq-job-notice error">
                  <h2>Execution failed</h2>
                  <p>{job.error || "No error details were returned."}</p>
                  <p>The recorded code is available in Code for inspection.</p>
                </div>
              ) : !result ? (
                <div role="status" className="fq-job-notice">
                  <UIIcon name="clock" size={20} />
                  <h2>
                    {job.status === "queued"
                      ? "Waiting to run"
                      : "Execution in progress"}
                  </h2>
                  <p>
                    You can switch pages. The result will appear here when it is
                    ready.
                  </p>
                </div>
              ) : (
                <>
                  {job.experiment && job.experiment.measurements.length > 0 && (
                    <div className="fq-job-measurements">
                      <label>
                        Measurement{" "}
                        <select
                          aria-label="Saved measurement"
                          value={measurementIndex}
                          onChange={(e) => {
                            setMeasurementIndex(Number(e.target.value));
                            setBatchIndex(0);
                            setPage(0);
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
                      {measurement?.batches &&
                        measurement.batches.length > 1 && (
                          <label>
                            Batch{" "}
                            <select
                              aria-label="Saved measurement batch"
                              value={batchIndex}
                              onChange={(e) => {
                                setBatchIndex(Number(e.target.value));
                                setPage(0);
                              }}
                            >
                              {measurement.batches.map((_, index) => (
                                <option key={index} value={index}>
                                  {index + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                    </div>
                  )}
                  {rows.length > 0 && total > 0 ? (
                    <section
                      className="fq-job-distribution"
                      aria-label="Measurement distribution"
                    >
                      <div className="fq-job-distribution-heading">
                        <h2>Measurement distribution</h2>
                        <div
                          className="fq-job-segment"
                          aria-label="Distribution view"
                        >
                          {["chart", "table"].map((item) => (
                            <button
                              key={item}
                              aria-pressed={view === item}
                              onClick={() => setView(item)}
                            >
                              {item === "chart" ? "Chart" : "Table"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="fq-job-chart-controls">
                        <div
                          className="fq-job-segment"
                          aria-label="Distribution units"
                        >
                          <button
                            aria-pressed={!counts}
                            onClick={() => setCounts(false)}
                          >
                            Probability
                          </button>
                          <button
                            aria-pressed={counts}
                            onClick={() => setCounts(true)}
                          >
                            Counts
                          </button>
                        </div>
                        <label>
                          Sort{" "}
                          <select
                            aria-label="Sort measurement states"
                            value={sort}
                            onChange={(e) => {
                              setSort(e.target.value as typeof sort);
                              setPage(0);
                            }}
                          >
                            <option value="probability">Probability</option>
                            <option value="state">State</option>
                          </select>
                        </label>
                      </div>
                      {view === "chart" ? (
                        <div className="fq-job-chart-scroll">
                          <div
                            className="fq-job-chart"
                            style={{
                              minWidth: Math.max(280, entries.length * 60),
                            }}
                          >
                            <div className="fq-job-axis">
                              {(counts && total < 4
                                ? Array.from(
                                    { length: total + 1 },
                                    (_, index) => (total - index) / total,
                                  )
                                : [1, 0.75, 0.5, 0.25, 0]
                              ).map((n) => (
                                <span key={n}>
                                  {counts
                                    ? Math.round(n * total).toLocaleString()
                                    : n * 100 + "%"}
                                </span>
                              ))}
                            </div>
                            <div className="fq-job-bars">
                              {entries.map(([bits, count]) => (
                                <div className="fq-job-bar-slot" key={bits}>
                                  <button
                                    className="fq-job-bar"
                                    style={{
                                      height: `${(count / total) * 100}%`,
                                    }}
                                    aria-label={`${bits}: ${count} shots, ${((count / total) * 100).toFixed(2)}%`}
                                  >
                                    <span className="fq-job-bar-tip">
                                      {bits} · {count.toLocaleString()} shots ·{" "}
                                      {((count / total) * 100).toFixed(2)}%
                                    </span>
                                  </button>
                                  <span
                                    className="fq-job-bar-label"
                                    title={bits}
                                  >
                                    {bits}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="fq-job-table-scroll">
                          <table>
                            <caption className="fq-sr-only">
                              Measurement results table
                            </caption>
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
                                  <td>
                                    <code>{bits}</code>
                                  </td>
                                  <td>{count.toLocaleString()}</td>
                                  <td>{((count / total) * 100).toFixed(2)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="fq-job-chart-footer">
                        <span>
                          {rows.length > 32
                            ? `Showing ${currentPage * 32 + 1}–${Math.min((currentPage + 1) * 32, rows.length)} of ${rows.length} observed states`
                            : `${rows.length} observed ${rows.length === 1 ? "state" : "states"}`}{" "}
                          · {total.toLocaleString()} recorded counts
                        </span>
                        {rows.length > 32 && (
                          <div>
                            <button
                              disabled={currentPage === 0}
                              onClick={() => setPage(currentPage - 1)}
                            >
                              Previous
                            </button>
                            <button
                              disabled={currentPage === lastPage}
                              onClick={() => setPage(currentPage + 1)}
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="fq-job-order">
                        {measurement
                          ? `Recorded qubit order: [${measurement.qubits.join(", ")}]. Keys are shown as saved; integer keys are labeled.`
                          : "Bit order: q0 first."}{" "}
                        Probabilities use all recorded counts.
                      </p>
                    </section>
                  ) : (
                    <div className="fq-job-notice">
                      <h2>No counts distribution</h2>
                      <p>
                        {measurement
                          ? "This measurement has no recorded counts. Saved values are available below."
                          : "No counts were saved in this result. Other recorded outputs are available below."}
                      </p>
                    </div>
                  )}
                  {measurement?.value != null && (
                    <details open className="fq-job-details">
                      <summary>Measurement value</summary>
                      <pre>{JSON.stringify(measurement.value, null, 2)}</pre>
                    </details>
                  )}
                  {job.experiment && <RecordedValues info={job.experiment} />}
                  {Boolean(
                    result.decoded?.length && result.registers?.length,
                  ) && (
                    <details className="fq-job-details">
                      <summary>Decoded registers</summary>
                      <div className="fq-job-table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>State</th>
                              {result.registers!.map((r) => (
                                <th key={r.name}>{r.name}</th>
                              ))}
                              <th>Counts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.decoded!.map((row) => (
                              <tr key={row.state}>
                                <td>{row.state}</td>
                                {result.registers!.map((r) => (
                                  <td key={r.name}>{row.values[r.name]}</td>
                                ))}
                                <td>{row.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </>
              )}
            </>
          )}
          {tab === "circuit" &&
            (program ? (
              <section className="fq-job-circuit">
                <div>
                  <h2>Recorded circuit</h2>
                  <button onClick={openCircuit}>Open in Quantum →</button>
                </div>
                <p>
                  {program.compiled.qubits} qubits · depth{" "}
                  {program.compiled.depth} ·{" "}
                  {program.compiled.instructions.length} operations
                </p>
                <CircuitPreview
                  program={program}
                  changed={new Set()}
                  onOpen={openCircuit}
                />
              </section>
            ) : (
              <p>No compiled circuit is available for this job.</p>
            ))}
          {tab === "code" && (
            <section className="fq-job-code">
              <SourceVersion
                label="Recorded source"
                source={source}
                language={language}
                currentSource={state.source}
                currentLanguage={state.language || "qasm"}
              />
              <CodeExample
                title="Model used for this result"
                code={source}
                language={language}
                actions={
                  <button
                    onClick={() =>
                      dispatch({
                        type: "model",
                        model: { name: job.name, source, language },
                        preserveDraft: true,
                      })
                    }
                  >
                    Open source in Model ↗
                  </button>
                }
              />
              {job.origin && (
                <details className="fq-job-details">
                  <summary>Generated OpenQASM</summary>
                  <CodeExample
                    title="Generated OpenQASM"
                    code={job.request.source}
                    language="qasm"
                  />
                </details>
              )}
            </section>
          )}
        </div>
        <details className="fq-job-details fq-job-provenance">
          <summary aria-label="Run details and provenance">
            Run details & provenance{" "}
            <span>Configuration, source version and original file</span>
          </summary>
          <div>
            {job.experiment && <ExperimentDetails info={job.experiment} />}
            <ProjectProvenance project={job.origin?.project} state={state} />
            <SourceVersion
              label="Recorded source"
              source={source}
              language={language}
              currentSource={state.source}
              currentLanguage={state.language || "qasm"}
            />
            <p>
              Job <code>{job.id}</code> · Seed {result?.seed ?? "not reported"}
              {result &&
                ` · FlagQuantum ${result.version} · ${result.backend || "backend not reported"}`}
              {result?.transport && ` · ${result.transport}`}
            </p>
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
          </div>
        </details>
      </div>
    </section>
  );
}
