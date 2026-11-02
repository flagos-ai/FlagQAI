import { useEffect, useRef, useState } from "react";
import { reproductionAPI, type Verification } from "../api/reproduction";
import { pythonAPI, type PythonRun } from "../api/python-runs";
import { download } from "../state/exports";
import { CodeExample } from "./CodeExample";
import type { ArchivedVerification } from "../api/research-packages";
import { verificationLabel } from "../state/verification-presentation";
export function Reproduction({
  runId,
  packageId,
  archived = [],
}: {
  runId: string;
  packageId?: string;
  archived?: ArchivedVerification[];
}) {
  const [records, setRecords] = useState<Verification[]>([]),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false),
    [logs, setLogs] = useState<PythonRun>();
  const alive = useRef(true),
    revision = useRef(0);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const version = revision.current;
      try {
        const values = await reproductionAPI.list(runId, packageId);
        if (alive.current && version === revision.current) {
          setRecords(values);
          setLoadError("");
        }
      } catch (problem) {
        if (alive.current) setLoadError(String(problem));
      }
      if (alive.current) timer = setTimeout(refresh, 2000);
    };
    void refresh();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [runId, packageId]);
  const act = async (action: () => Promise<Verification>) => {
    revision.current++;
    setBusy(true);
    setError("");
    try {
      const value = await action();
      if (alive.current)
        setRecords((current) => [
          value,
          ...current.filter((r) => r.id !== value.id),
        ]);
    } catch (problem) {
      if (alive.current)
        setError(String(problem) + " No automatic retry was made.");
    } finally {
      revision.current++;
      if (alive.current) setBusy(false);
    }
  };
  const pending = records.some((r) =>
    ["verifying", "submitting", "submission_unknown"].includes(r.status),
  );
  const rows = [
    ...records.map((record) => ({
      record,
      key: "current:" + record.id,
      archive: undefined as ArchivedVerification | undefined,
    })),
    ...archived
      .filter((a) => a.report.original_run === runId)
      .map((archive) => ({
        record: {
          ...archive.report,
          status: archive.validated_status,
          artifacts: archive.comparison?.artifacts,
          tolerance: archive.comparison?.tolerance,
        },
        key: "archive:" + archive.key,
        archive,
      })),
  ];
  return (
    <section className="fq-reproduction" aria-label="Reproduction verification">
      <h3>Verify reproduction</h3>
      <p>
        Check the configured runtime, then explicitly run this archived source
        in an independent task. Your editor and chat drafts stay unchanged.
      </p>
      <button
        disabled={busy || pending}
        onClick={() => void act(() => reproductionAPI.check(runId, packageId))}
      >
        {busy ? "Checking…" : "Check reproduction environment"}
      </button>
      {(error || loadError) && (
        <p role="alert">
          {error || loadError}
          {loadError &&
            (records.length
              ? " Verification updates interrupted; showing the last confirmed snapshot. No task was resubmitted."
              : " Verification updates interrupted; the current state is unavailable. No task was resubmitted.")}
        </p>
      )}
      {rows.map(({ record, key, archive }, index) => (
        <details
          key={key}
          open={index === 0}
          className="fq-reproduction-record"
          data-verdict={record.status}
          data-evidence-scope={archive ? "archived" : "current"}
          data-updates-interrupted={!archive && !!loadError}
        >
          <summary>
            {loadError && !archive ? "Last confirmed snapshot · " : ""}
            {verificationLabel(record, !!archive)} ·{" "}
            {new Date(record.created_at * 1000).toLocaleString()}
          </summary>
          {archive && <p className="fq-research-note">{archive.notice}</p>}
          {archive && record.run_id && !archive.run && (
            <small>
              The reproduction run snapshot is unavailable in this archive.
            </small>
          )}
          <p>
            Source {record.source_hash.slice(0, 12)} · original run{" "}
            {record.original_run.slice(0, 8)}
            {record.run_id && ` · new run ${record.run_id.slice(0, 8)}`}
          </p>
          <dl className="fq-reproduction-environment">
            <dt>Archived SDK</dt>
            <dd>{record.producer_versions.join(", ") || "Unrecorded"}</dd>
            <dt>
              {archive ? "Recorded verification runtime" : "Configured runtime"}
            </dt>
            <dd>
              SDK {record.runtime.sdk_version || "missing"} · Python{" "}
              {record.runtime.python} · PyTorch{" "}
              {record.runtime.pytorch || "missing"}
            </dd>
            <dt>{archive ? "Recorded compute" : "Compute"}</dt>
            <dd>
              {record.configured_environment.transport} ·{" "}
              {record.configured_environment.python}
            </dd>
          </dl>
          {!archive && record.preparation && (
            <details
              className="fq-environment-preparation"
              open={record.status === "blocked"}
            >
              <summary>Environment manifest & preparation</summary>
              {record.preparation.blockers.length > 0 && (
                <ul role="alert">
                  {record.preparation.blockers.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              <p>
                Inspection only. Nothing was installed and no archived source
                was run. Preparation commands are for manual review and
                execution in a separate environment.
              </p>
              <dl className="fq-reproduction-environment">
                <dt>Platform</dt>
                <dd>
                  {String(record.preparation.current.system || "Unrecorded")} ·{" "}
                  {String(record.preparation.current.machine || "Unrecorded")}
                </dd>
                <dt>SDK distribution metadata</dt>
                <dd>
                  {String(
                    record.preparation.current.sdk_distribution_version ||
                      "Missing",
                  )}
                </dd>
                <dt>SDK source revision</dt>
                <dd>
                  {String(
                    record.preparation.current.sdk_revision || "Unrecorded",
                  )}
                </dd>
                <dt>SDK code fingerprint</dt>
                <dd>
                  {String(
                    record.preparation.current.sdk_code_sha256 || "Unrecorded",
                  )}
                </dd>
              </dl>
              <ul>
                {record.preparation.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <div className="fq-reproduction-table">
                <table>
                  <thead>
                    <tr>
                      <th>Dependency</th>
                      <th>Recorded</th>
                      <th>Inspected</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.preparation.dependencies.map((dep) => (
                      <tr key={dep.name}>
                        <td>{dep.name}</td>
                        <td>{dep.recorded || "Unrecorded"}</td>
                        <td>{dep.current || "Missing"}</td>
                        <td>{dep.state}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Referenced imports:{" "}
                {record.preparation.referenced_imports.join(", ") || "none"}.
                Conditional imports may require manual inspection.
              </p>
              <CodeExample
                title="Preparation commands"
                code={record.preparation.commands}
                language="plain"
              />
              <button
                onClick={() =>
                  download(
                    `environment-${record.id}.json`,
                    JSON.stringify(record.preparation, null, 2),
                    "application/json",
                  )
                }
              >
                Download environment manifest
              </button>
            </details>
          )}
          {!archive && record.recorded_execution && (
            <details>
              <summary>Recorded backend and sampling settings</summary>
              <ul>
                {record.recorded_execution.map((setting, i) => (
                  <li key={i}>
                    {setting.filename}:{" "}
                    {setting.backend || "unrecorded backend"} ·{" "}
                    {setting.device || "unrecorded device"} ·{" "}
                    {setting.precision || "unrecorded precision"}
                    {setting.measurements.map((m, j) => (
                      <span key={j}>
                        {" "}
                        · shots {m.shots ?? "unrecorded"}, seed{" "}
                        {m.seed ?? "unrecorded"}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {record.differences.length > 0 && (
            <ul>
              {record.differences.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <p>{record.notice}</p>
          {!archive && record.status === "prepared" && (
            <button
              disabled={busy || pending}
              onClick={() => void act(() => reproductionAPI.start(record.id))}
            >
              Run archived source & verify
            </button>
          )}
          <p role="status" className="fq-sr-only">
            {loadError && !archive ? "Last confirmed snapshot · " : ""}
            {verificationLabel(record, !!archive)}
          </p>
          {record.error && <p role="alert">{record.error}</p>}
          {record.tolerance && (
            <small>
              Numeric tolerance: absolute {record.tolerance.absolute}, relative{" "}
              {record.tolerance.relative}. Counts, shots and seed must match
              exactly.
            </small>
          )}
          {record.artifacts && (
            <div className="fq-reproduction-table">
              <table>
                <thead>
                  <tr>
                    <th>Artifact</th>
                    <th>Circuit</th>
                    <th>Measurements</th>
                    <th>Counts</th>
                  </tr>
                </thead>
                <tbody>
                  {record.artifacts.map((row) => (
                    <tr key={row.filename}>
                      <td>
                        {row.filename}
                        {row.original_metrics && row.reproduced_metrics && (
                          <small>
                            Expected cut{" "}
                            {row.original_metrics.expected_cut.toFixed(6)} →{" "}
                            {row.reproduced_metrics.expected_cut.toFixed(6)};
                            optimal samples{" "}
                            {(
                              row.original_metrics.optimal_sample_rate * 100
                            ).toFixed(2)}
                            % →{" "}
                            {(
                              row.reproduced_metrics.optimal_sample_rate * 100
                            ).toFixed(2)}
                            %
                          </small>
                        )}
                      </td>
                      <td>{row.circuit}</td>
                      <td>{row.measurements}</td>
                      <td>{row.counts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="fq-reproduction-actions">
            {!archive && record.status === "verifying" && record.run_id && (
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await pythonAPI.cancel(record.run_id!);
                    return reproductionAPI.read(record.id);
                  })
                }
              >
                Cancel reproduction
              </button>
            )}
            {record.run_id && (!archive || archive.run) && (
              <button
                onClick={async () => {
                  try {
                    setLogs(
                      archive?.run || (await pythonAPI.read(record.run_id!)),
                    );
                  } catch (problem) {
                    setError(String(problem));
                  }
                }}
              >
                View reproduction logs
              </button>
            )}
            <button
              onClick={() =>
                download(
                  `reproduction-${record.id}.json`,
                  JSON.stringify(archive || record, null, 2),
                )
              }
            >
              Download verification record
            </button>
          </div>
          {logs && logs.id === record.run_id && (
            <details open>
              <summary>
                Run {logs.id} · {logs.status}
              </summary>
              <pre>
                {logs.logs.map((log) => log.text).join("") ||
                  logs.error ||
                  "No recorded output."}
              </pre>
            </details>
          )}
        </details>
      ))}
    </section>
  );
}
