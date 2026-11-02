import {
  researchPackages,
  type ResearchPackage,
} from "../api/research-packages";
import { useEffect, useRef, useState } from "react";
import { pythonAPI } from "../api/python-runs";
import { readExperiment, experimentFileURL } from "../api/experiments";
import {
  loadResearchRecord,
  adoptionFor,
  validAdoption,
  researchManifest,
  type ResearchRecord as RecordData,
  type ResearchTurn,
  type ResearchAdoption,
} from "../state/research-record";
import { iterationQuestion } from "../state/qaoa-iteration";
import { download } from "../state/exports";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { CodeExample } from "./CodeExample";
import { Reproduction } from "./Reproduction";
import { VerificationSummary } from "./VerificationSummary";
export function ResearchRecord({
  runId,
  turns,
  onClose,
  onCompare,
  onInspect,
  onCircuit,
  imported,
  onLoadSource,
}: {
  runId: string;
  turns: ResearchTurn[];
  onClose: () => void;
  onCompare: (a: string, b: string) => Promise<void>;
  onInspect: (id: string) => Promise<void>;
  onCircuit: (id: string) => Promise<void>;
  imported?: ResearchPackage;
  onLoadSource?: (name: string, source: string) => void;
}) {
  const [record, setRecord] = useState<RecordData>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState(runId),
    [adopted, setAdopted] = useState<ResearchAdoption | null>(null),
    [reason, setReason] = useState(""),
    [storageNote, setStorageNote] = useState(""),
    [busy, setBusy] = useState(false);
  const [preparation, setPreparation] = useState<string>(""),
    [showLogs, setShowLogs] = useState(false);
  const choiceKey = (value: RecordData) =>
    "fq-research-adopted-v1:" +
    (imported?.id || value.root) +
    ":" +
    value.rootSource;
  const reasonEdited = useRef(false),
    selectionTouched = useRef(false);
  const signature = JSON.stringify(turns);
  useEffect(() => {
    const controller = new AbortController();
    setRecord(undefined);
    setError("");
    setAdopted(null);
    setStorageNote("");
    void loadResearchRecord(runId, turns, {
      run: async (id) =>
        imported
          ? (imported.runs[id] ??
            Promise.reject(Error("Archived run is missing.")))
          : pythonAPI.read(id, controller.signal),
      experiment: async (id) =>
        imported
          ? (imported.experiments[id] ??
            Promise.reject(Error("Archived artifact is missing.")))
          : readExperiment(id, controller.signal),
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        setRecord(value);
        try {
          const stored = localStorage.getItem(choiceKey(value));
          const saved =
            stored === null ? imported?.research.adopted : JSON.parse(stored);
          if (saved) {
            if (validAdoption(value, saved)) {
              setAdopted(saved);
              if (imported && !selectionTouched.current) {
                setSelected(saved.run);
                if (!reasonEdited.current) setReason(saved.reason);
              } else if (saved.run === selected && !reasonEdited.current)
                setReason(saved.reason);
            } else
              setStorageNote(
                "The previously adopted version could not be verified in this snapshot. No replacement was selected.",
              );
          }
        } catch {
          setStorageNote(
            "Local adoption preferences are unavailable. Saved run evidence is unchanged.",
          );
        }
      })
      .catch((problem) => {
        if (!controller.signal.aborted) setError(String(problem));
      });
    return () => controller.abort();
  }, [runId, signature, retry]);
  const entry = record?.entries.find((e) => e.id === selected),
    s = entry?.summary,
    root = record?.entries.find((e) => e.id === record.root)?.summary;
  const act = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
      onClose();
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  };
  const adopt = () => {
    if (!record || !entry) return;
    try {
      const value = adoptionFor(entry, reason);
      localStorage.setItem(choiceKey(record), JSON.stringify(value));
      setAdopted(value);
      setStorageNote(
        "Adopted version saved in this browser. Code, results and drafts are unchanged.",
      );
    } catch (problem) {
      setStorageNote(
        "Could not save adoption: " +
          String(problem) +
          ". The previous selection is retained.",
      );
    }
  };
  const durations =
    record?.entries.flatMap((e) =>
      typeof e.run?.elapsed_seconds === "number" &&
      Number.isFinite(e.run.elapsed_seconds)
        ? [e.run.elapsed_seconds]
        : [],
    ) || [];
  return (
    <Modal
      className="fq-research-record"
      label="Research record"
      onClose={onClose}
    >
      <header>
        <div>
          <h2>QAOA research record</h2>
          <small>
            {imported
              ? "Imported evidence · read-only source history"
              : "Saved research evidence"}
          </small>
        </div>
        <CloseButton label="Close research record" onClick={onClose} />
      </header>
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((n) => n + 1)}>Reload record</button>
        </p>
      )}
      {!record && !error && (
        <p role="status">Reading the goal, versions and saved evidence…</p>
      )}
      {record && (
        <>
          <section aria-label="Research objective">
            <h3>Objective</h3>
            <p className="fq-research-goal">
              {iterationQuestion(record.goal)?.summary || record.goal}
            </p>
            <details>
              <summary>Original requests · {record.turns.length}</summary>
              {record.turns.map((turn, i) => (
                <div key={i}>
                  <strong>
                    Request {i + 1} ·{" "}
                    {turn.active
                      ? "Agent working"
                      : turn.outcome || "outcome unrecorded"}
                  </strong>
                  <pre>{turn.goal}</pre>
                </div>
              ))}
            </details>
          </section>
          <div className="fq-research-summary">
            <span>
              {record.entries.length} runs ·{" "}
              {record.entries.filter((e) => e.summary).length} verified versions
            </span>
            <span>
              Recorded Python compute:{" "}
              {durations.reduce((a, b) => a + b, 0).toFixed(2)} s
              {durations.length < record.entries.length
                ? " · incomplete timing"
                : ""}
            </span>
            <span>Model cost: unrecorded</span>
          </div>
          <p className="fq-research-note">
            Compute includes search, replay and failed attempts with recorded
            durations. Monetary cost and a global optimization guarantee cannot
            be inferred from these records.
          </p>
          {record.notices.map((notice) => (
            <p role="status" key={notice}>
              {notice}
            </p>
          ))}
          <section aria-label="Research versions">
            <h3>Versions and attempts</h3>
            <div className="fq-research-table">
              <table>
                <thead>
                  <tr>
                    <th>Run / source</th>
                    <th>Status</th>
                    <th>Expected cut</th>
                    <th>Optimal samples</th>
                    <th>Depth / gates</th>
                    <th>Compute</th>
                    <th>Selection</th>
                  </tr>
                </thead>
                <tbody>
                  {record.entries.map((e) => (
                    <tr key={e.id} data-selected={selected === e.id}>
                      <th scope="row">
                        <button
                          aria-label={"Select research run " + e.id}
                          aria-pressed={selected === e.id}
                          onClick={() => {
                            setSelected(e.id);
                            selectionTouched.current = true;
                            reasonEdited.current = false;
                            setReason(
                              adopted?.run === e.id ? adopted.reason : "",
                            );
                          }}
                        >
                          {e.id === record.root
                            ? "Baseline optimized"
                            : e.run?.name || "Unavailable run"}{" "}
                          · {e.id.slice(0, 8)}
                        </button>
                        <small title={e.run?.source_hash}>
                          code {e.run?.source_hash?.slice(0, 8) || "unrecorded"}
                        </small>
                      </th>
                      <td>
                        {e.issue
                          ? "Evidence unavailable"
                          : e.run?.status || "unavailable"}
                        {e.run?.collection_status &&
                        e.run.collection_status !== "completed"
                          ? " · collection " + e.run.collection_status
                          : ""}
                      </td>
                      <td>{e.summary?.optimized.expected.toFixed(3) || "—"}</td>
                      <td>
                        {e.summary
                          ? (e.summary.optimized.hit * 100).toFixed(1) + "%"
                          : "—"}
                      </td>
                      <td>
                        {e.summary
                          ? `${e.summary.records[1].program.compiled.depth} / ${e.summary.records[1].program.compiled.instructions.length}`
                          : "—"}
                      </td>
                      <td>{e.run?.elapsed_seconds?.toFixed(2) ?? "—"} s</td>
                      <td>{adopted?.run === e.id ? "Adopted" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-label="Research conclusion">
            <h3>Adopted version</h3>
            {adopted ? (
              <p>
                Run {adopted.run.slice(0, 8)} · code{" "}
                {adopted.source.slice(0, 8)}
                {adopted.reason ? " · " + adopted.reason : ""}
              </p>
            ) : (
              <p>
                No version adopted yet. Select a verified version and record
                your decision.
              </p>
            )}
            {adopted && (
              <button
                onClick={() => {
                  try {
                    if (imported)
                      localStorage.setItem(choiceKey(record), "null");
                    else localStorage.removeItem(choiceKey(record));
                    setAdopted(null);
                    setStorageNote(
                      "Adoption cleared. All versions and evidence are retained.",
                    );
                  } catch {
                    setStorageNote(
                      "Could not clear the saved adoption. The previous selection is retained.",
                    );
                  }
                }}
              >
                Clear adopted version
              </button>
            )}
            {(adopted
              ? record.entries.find((e) => e.id === adopted.run)?.run
              : entry?.run
            )?.source_hash && (
              <VerificationSummary
                key={(imported?.id || "live") + (adopted?.run || selected)}
                run={adopted?.run || selected}
                source={
                  (adopted
                    ? record.entries.find((e) => e.id === adopted.run)?.run
                    : entry?.run)!.source_hash!
                }
                packageId={imported?.id}
                archived={imported?.archived_verifications}
                adopted={!!adopted}
              />
            )}
            {storageNote && <p role="status">{storageNote}</p>}
          </section>
          {entry && (
            <section
              className="fq-research-detail"
              aria-label="Selected research run"
            >
              <h3>Selected run · {entry.id.slice(0, 8)}</h3>
              {entry.issue && <p role="status">{entry.issue}</p>}
              {s && (
                <>
                  <ul className="fq-research-checks">
                    <li>Source and archive provenance verified</li>
                    <li>
                      {s.replayMatches
                        ? "Saved seeded replay matches"
                        : "Replay differs or is not fully verified"}
                    </li>
                    <li>
                      Graph: {s.n} nodes / {s.edges} edges · enumerated optimum{" "}
                      {s.optimum}
                    </li>
                  </ul>
                  <p>
                    Uniform baseline → optimized: expected cut{" "}
                    {s.baseline.expected.toFixed(3)} →{" "}
                    {s.optimized.expected.toFixed(3)}; optimal samples{" "}
                    {(s.baseline.hit * 100).toFixed(1)}% →{" "}
                    {(s.optimized.hit * 100).toFixed(1)}%.
                  </p>
                  <p>
                    Recorded settings: {s.optimized.shots} shots · seed{" "}
                    {String(s.optimized.seed ?? "unrecorded")} · {s.device} /{" "}
                    {s.backend} · SDK{" "}
                    {s.records[1].program.experiment!.producer_version}.
                  </p>
                  <p>
                    These checks cover saved evidence; read the original request
                    for any additional acceptance criteria.
                  </p>
                  <div className="fq-research-actions">
                    <button
                      disabled={busy || entry.id === record.root || !root}
                      onClick={() =>
                        void act(() =>
                          onCompare(root!.records[1].id, s.records[1].id),
                        )
                      }
                    >
                      Compare with baseline
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          onCompare(s.records[1].id, s.records[2].id),
                        )
                      }
                    >
                      Compare replay
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void act(() => onCircuit(s.records[1].id))}
                    >
                      View circuit
                    </button>
                  </div>
                  <label>
                    Decision note (optional)
                    <textarea
                      aria-label="Research adoption reason"
                      maxLength={1000}
                      rows={2}
                      value={reason}
                      onChange={(e) => {
                        reasonEdited.current = true;
                        setReason(e.target.value);
                      }}
                    />
                  </label>
                  <button disabled={!s.replayMatches} onClick={adopt}>
                    Adopt selected version
                  </button>
                </>
              )}
              {entry.run && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      imported
                        ? setShowLogs(!showLogs)
                        : void act(() => onInspect(entry.id))
                    }
                  >
                    View run and logs
                  </button>
                  {showLogs && imported && (
                    <pre aria-label="Archived run output">
                      {entry.run.logs.map((log) => log.text).join("") ||
                        "No output was recorded."}
                    </pre>
                  )}
                  {imported && (
                    <details>
                      <summary>Reproduction preparation</summary>
                      <p>
                        Required SDK:{" "}
                        {s?.records[1].program.experiment!.producer_version ||
                          entry.run.runtime?.sdk_version ||
                          "unrecorded"}
                        ; backend {s?.backend || "unrecorded"}; device{" "}
                        {s?.device || "unrecorded"}; shots{" "}
                        {s?.optimized.shots ?? "unrecorded"}; seed{" "}
                        {String(s?.optimized.seed ?? "unrecorded")}.
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            const env = await pythonAPI.environment();
                            setPreparation(
                              `Configured transport: ${env.transport}; interpreter: ${env.python}. SDK compatibility and external dependencies must be checked before running. No execution was submitted.`,
                            );
                          } catch (error) {
                            setPreparation(String(error));
                          }
                        }}
                      >
                        Check configured runtime
                      </button>
                      {preparation && <p role="status">{preparation}</p>}
                      <button
                        onClick={() => {
                          onLoadSource?.(entry.run!.name, entry.run!.source);
                          onClose();
                        }}
                      >
                        Open source in editor
                      </button>
                      <p>
                        Your current draft is retained in My models. Opening
                        source does not run it; use Run Python in the editor or
                        the explicit reproduction action below.
                      </p>
                    </details>
                  )}
                  {s && (
                    <Reproduction
                      key={(imported?.id || "live") + entry.id}
                      runId={entry.id}
                      packageId={imported?.id}
                      archived={imported?.archived_verifications}
                    />
                  )}
                  <details>
                    <summary>
                      Saved source ·{" "}
                      {entry.run.source_hash?.slice(0, 12) || "unrecorded hash"}
                    </summary>
                    <CodeExample
                      title={entry.run.name}
                      code={entry.run.source}
                      language="python"
                      lineNumbers
                    />
                    <button
                      onClick={() =>
                        download(`research-${entry.id}.py`, entry.run!.source)
                      }
                    >
                      Download source
                    </button>
                  </details>
                  <details>
                    <summary>
                      Artifacts · {entry.run.experiments?.length || 0}
                    </summary>
                    <ul>
                      {entry.run.experiments?.map((file) => (
                        <li key={file.id}>
                          <a
                            href={experimentFileURL(
                              imported?.local_ids[file.id] || file.id,
                            )}
                            download={file.filename}
                          >
                            {file.filename}
                          </a>
                          <code>{file.sha256}</code>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </section>
          )}
          <p className="fq-research-note">
            The JSON record contains source snapshots and artifact references.
            Download the original .fqx archives separately for offline
            reproduction.
          </p>
          <footer>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await researchPackages.export(
                    imported
                      ? {
                          package_id: imported.id,
                          adopted:
                            adopted && validAdoption(record, adopted)
                              ? adopted
                              : null,
                        }
                      : { research: researchManifest(record, adopted) },
                  );
                } catch (problem) {
                  setError(String(problem));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Preparing package…" : "Export research package"}
            </button>
            <button
              onClick={() =>
                download(
                  "qaoa-research-record.json",
                  JSON.stringify(researchManifest(record, adopted), null, 2),
                  "application/json",
                )
              }
            >
              Download research record
            </button>
            <button onClick={() => setRetry((n) => n + 1)}>
              Refresh evidence
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}
