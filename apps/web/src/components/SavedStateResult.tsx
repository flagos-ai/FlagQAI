import { useEffect, useState } from "react";
import type { ExperimentInfo } from "../contracts/quantum-workspace";
import { readExperiment } from "../api/experiments";
import { previewStateDistribution } from "../state/saved-state";
import type { StateDistribution } from "../state/saved-state";

export function SavedStateResult({
  info,
  qubits,
}: {
  info: ExperimentInfo;
  qubits: number;
}) {
  const initial =
    info.state_distribution === undefined
      ? previewStateDistribution(info.state, qubits)
      : info.state_distribution;
  const [loaded, setLoaded] = useState<{
    id: string;
    distribution: StateDistribution | null;
  } | null>(null);
  const [page, setPage] = useState(0);
  const needsRead = !initial && info.state_distribution === undefined;
  const loading = needsRead && loaded?.id !== info.id;
  const distribution = needsRead
    ? loaded?.id === info.id
      ? loaded.distribution
      : null
    : initial;
  useEffect(() => {
    setPage(0);
    if (!needsRead) return;
    const controller = new AbortController();
    void readExperiment(info.id, controller.signal)
      .then((record) => {
        if (!controller.signal.aborted)
          setLoaded({
            id: info.id,
            distribution: record.program.experiment?.state_distribution ?? null,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoaded({ id: info.id, distribution: null });
      });
    return () => controller.abort();
  }, [info.id, needsRead]);
  if (!distribution)
    return (
      <p className="fq-state-note" role="status">
        {loading
          ? "Reading the saved statevector…"
          : "Saved state available in Recorded state below. A complete probability preview is unavailable."}
      </p>
    );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(distribution.entries.length / 32) - 1),
  );
  const rows = distribution.entries.slice(
    currentPage * 32,
    (currentPage + 1) * 32,
  );
  return (
    <section
      className="fq-state-result"
      aria-label="Saved statevector probabilities"
    >
      <div className="fq-state-heading">
        <h2>Statevector probabilities</h2>
        <span>
          {distribution.support_size.toLocaleString()} basis states above{" "}
          {distribution.threshold}
        </span>
      </div>
      <p className="fq-state-note">
        From the complete saved state · qubit order: q0 first
      </p>
      {distribution.support_size === 0 && (
        <p className="fq-state-note">
          No basis states exceed the display threshold.
        </p>
      )}
      <div className="fq-job-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Basis state</th>
              <th>Probability</th>
              <th aria-label="Probability bar" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.state}>
                <td>
                  <code>{row.state}</code>
                </td>
                <td>{(row.probability * 100).toPrecision(6)}%</td>
                <td className="fq-state-bar">
                  <span
                    style={{
                      width: `${Math.min(100, row.probability * 100)}%`,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(distribution.entries.length > 32 ||
        distribution.omitted_probability > 1e-12) && (
        <div className="fq-job-chart-footer">
          <span>
            Showing {rows.length ? currentPage * 32 + 1 : 0}–
            {currentPage * 32 + rows.length} of {distribution.support_size}{" "}
            states
            {distribution.omitted_probability > 1e-12
              ? ` · ${(distribution.omitted_probability * 100).toPrecision(4)}% probability outside this preview`
              : ""}
          </span>
          {distribution.entries.length > 32 && (
            <div>
              <button
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <button
                disabled={(currentPage + 1) * 32 >= distribution.entries.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
      {Math.abs(distribution.total_probability - 1) > 1e-6 && (
        <p role="status">
          Saved probability sum: {distribution.total_probability.toPrecision(8)}
          . Values are shown without renormalization.
        </p>
      )}
    </section>
  );
}
