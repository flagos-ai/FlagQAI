import type { ExperimentImport } from "../contracts/quantum-workspace";
import {
  savedResearchResult,
  researchComparison,
  researchNumber as num,
} from "../state/research-result";

export function ResearchMetricComparison({
  left,
  right,
}: {
  left: ExperimentImport;
  right: ExperimentImport;
}) {
  const a = savedResearchResult(left),
    b = savedResearchResult(right);
  if (!a && !b) return null;
  const compared = researchComparison(a, b);
  const settingsDiffer =
    a &&
    b &&
    JSON.stringify(a.parameters.execution) !==
      JSON.stringify(b.parameters.execution);
  return (
    <section
      className="fq-research-metric-comparison"
      aria-label="Research metrics and resource cost"
    >
      <div className="fq-research-metric-heading">
        <strong>Research outcome</strong>
        {a && b && a.problem.sha256 === b.problem.sha256 && (
          <small>
            Max-Cut · exact optimum {num(a.problem.classical_optimum)}{" "}
            {a.problem.objective_unit}
          </small>
        )}
      </div>
      {compared.warning && <p role="status">{compared.warning}</p>}
      {compared.metrics.length > 0 && (
        <div className="fq-research-metric-table">
          <table>
            <caption className="fq-sr-only">Research metric comparison</caption>
            <thead>
              <tr>
                <th>Metric</th>
                <th>A · Baseline</th>
                <th>B · Variant</th>
                <th>Change B − A</th>
              </tr>
            </thead>
            <tbody>
              {compared.metrics.map(
                ({ left: l, right: r, delta, relative, improvement }) => (
                  <tr key={l.key}>
                    <th>
                      {l.label}
                      <small>
                        {l.method === "sampled"
                          ? "Saved samples"
                          : "Saved exact probabilities"}
                      </small>
                    </th>
                    <td>
                      {num(l.unit === "probability" ? l.value * 100 : l.value)}{" "}
                      {l.unit === "probability" ? "%" : l.unit}
                    </td>
                    <td>
                      {num(r.unit === "probability" ? r.value * 100 : r.value)}{" "}
                      {r.unit === "probability" ? "%" : r.unit}
                    </td>
                    <td
                      data-change={
                        delta === null ||
                        l.method === "sampled" ||
                        improvement == null
                          ? undefined
                          : improvement > 0
                            ? "better"
                            : improvement < 0
                              ? "worse"
                              : "same"
                      }
                    >
                      {delta === null ? (
                        "Not comparable"
                      ) : (
                        <>
                          {num(
                            l.unit === "probability" ? delta * 100 : delta,
                            true,
                          )}{" "}
                          {l.unit === "probability" ? "pp" : l.unit}
                          <small>
                            {l.method === "sampled"
                              ? "Observed change · significance not tested"
                              : `${improvement === 0 ? "Unchanged" : improvement! > 0 ? "Higher objective" : "Lower objective"}${relative === null || l.unit === "probability" ? "" : ` · ${num(relative * 100, true)}% relative`}`}
                          </small>
                        </>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {compared.resources.length > 0 && (
        <div
          className="fq-research-resources"
          aria-label="Resource cost comparison"
        >
          {compared.resources.map(({ left: l, right: r, delta }) => (
            <div key={l.key}>
              <small>{l.label}</small>
              <span>
                {num(l.value)} → {num(r.value)} {l.unit}
              </span>
              <small>
                {l.scope === "whole Python run"
                  ? a?.binding.run_id === b?.binding.run_id
                    ? "Shared run total · not per candidate"
                    : "Whole run · not isolated candidate timing"
                  : delta === null
                    ? "Not comparable"
                    : delta === 0
                      ? "Same cost"
                      : `${num(delta, true)} ${l.unit}`}
              </small>
            </div>
          ))}
        </div>
      )}
      {settingsDiffer && (
        <p className="fq-muted">
          Execution settings differ. Exact metrics and sampled observations are
          labeled separately; timing is not a controlled performance benchmark.
        </p>
      )}
      <details>
        <summary>Parameters, code versions and evidence</summary>
        <div className="fq-research-evidence-grid">
          {[
            ["A", a],
            ["B", b],
          ].map(([side, result]) => {
            if (typeof result !== "object")
              return (
                <p key={String(side)}>
                  {String(side)} · No bound research evidence
                </p>
              );
            return (
              <div key={String(side)}>
                <strong>
                  {String(side)} · code{" "}
                  {result.binding.source_sha256.slice(0, 12)}
                </strong>
                <dl>
                  <dt>Run</dt>
                  <dd>{result.binding.run_id}</dd>
                  <dt>Code SHA-256</dt>
                  <dd>{result.binding.source_sha256}</dd>
                  <dt>Archive SHA-256</dt>
                  <dd>{result.binding.archive_sha256}</dd>
                  <dt>Report SHA-256</dt>
                  <dd>{result.sha256}</dd>
                  <dt>Declared graph</dt>
                  <dd>{JSON.stringify(result.problem.edges)}</dd>
                </dl>
                <strong>Execution parameters</strong>
                <pre>
                  {JSON.stringify(
                    {
                      ...result.parameters.source_constants,
                      ...result.parameters.execution,
                    },
                    null,
                    2,
                  )}
                </pre>
                <details>
                  <summary>
                    Saved gate parameters ({result.parameters.rotations.length})
                    · units per operation
                  </summary>
                  <pre>
                    {JSON.stringify(result.parameters.rotations, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>
        <p className="fq-muted">{a?.limitations || b?.limitations}</p>
      </details>
    </section>
  );
}
