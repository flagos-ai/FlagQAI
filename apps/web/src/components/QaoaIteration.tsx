import { useEffect, useState } from "react";
import { pythonAPI, type PythonRun } from "../api/python-runs";
import { readExperiment } from "../api/experiments";
import { qaoaOutcome, qaoaFiles } from "../state/qaoa-outcome";
import {
  compareQaoaVersions,
  iterationFromSource,
} from "../state/qaoa-iteration";
type Summary = Awaited<ReturnType<typeof qaoaOutcome>>;
async function summary(run: PythonRun, signal: AbortSignal) {
  const refs = qaoaFiles.map((filename) =>
    run.experiments?.find((e) => e.filename === filename),
  );
  if (refs.some((r) => !r)) throw Error("The QAOA archive set is incomplete.");
  return qaoaOutcome(
    run,
    await Promise.all(refs.map((r) => readExperiment(r!.id, signal))),
  );
}
export function QaoaIteration({
  run,
  active,
  onCompare,
  onInspect,
}: {
  run: PythonRun;
  active: boolean;
  onCompare: (a: string, b: string) => Promise<void>;
  onInspect: (id: string) => Promise<void>;
}) {
  const [data, setData] = useState<{
    key: string;
    parent?: PythonRun;
    baseline?: Summary;
    current?: Summary;
    error?: string;
  }>({ key: "" });
  const [retry, setRetry] = useState(0),
    [actionError, setActionError] = useState("");
  const key =
    run.id +
    ":" +
    run.source_hash +
    ":" +
    run.status +
    ":" +
    run.collection_status +
    ":" +
    JSON.stringify(run.experiments);
  useEffect(() => {
    const controller = new AbortController();
    setData({ key });
    void (async () => {
      try {
        const ref = iterationFromSource(run.source);
        if (!ref)
          throw Error("No valid iteration lineage comment was recorded.");
        const parent = await pythonAPI.read(ref.run, controller.signal),
          baseline = await summary(parent, controller.signal);
        // Show the preserved baseline even while the new run is active or failed.
        if (
          parent.id !== ref.run ||
          baseline.sourceHash !== ref.source ||
          baseline.records[1].id !== ref.archive ||
          baseline.records[1].program.experiment!.sha256 !== ref.sha256 ||
          parent.id === run.id
        )
          throw Error("The recorded baseline identity does not match.");
        if (!controller.signal.aborted) setData({ key, parent, baseline });
        if (
          run.status === "completed" &&
          run.collection_status === "completed" &&
          !run.collection_errors?.length
        ) {
          const current = await summary(run, controller.signal);
          compareQaoaVersions(ref, parent, baseline, run, current);
          if (!controller.signal.aborted)
            setData({ key, parent, baseline, current });
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setData((previous) => ({
            ...previous,
            key,
            error: error instanceof Error ? error.message : String(error),
          }));
      }
    })();
    return () => controller.abort();
  }, [key, retry]);
  let ref;
  try {
    ref = iterationFromSource(run.source);
  } catch {
    /* The effect displays the invalid lineage error. */
  }
  const d = data.key === key ? data : undefined;
  const comparison =
    ref && d?.parent && d.baseline && d.current
      ? compareQaoaVersions(ref, d.parent, d.baseline, run, d.current)
      : null;
  const act = async (action: () => Promise<void>) => {
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(String(error));
    }
  };
  return (
    <section className="fq-qaoa-iteration" aria-label="QAOA version comparison">
      <header>
        <strong>QAOA iteration</strong>
        <small>Requested p={ref?.layers ?? "?"} · baseline preserved</small>
      </header>
      {d?.baseline && (
        <>
          <p>
            Previous optimized result:{" "}
            {d.baseline.optimized.expected.toFixed(2)} expected cut · code{" "}
            {d.baseline.sourceHash.slice(0, 8)}
          </p>
          {comparison && d.current ? (
            <>
              <strong>
                {comparison.label} · {comparison.delta > 0 ? "+" : ""}
                {comparison.delta.toFixed(3)}
              </strong>
              <dl className="fq-qaoa-version-metrics">
                <div>
                  <dt>Expected cut</dt>
                  <dd>
                    {d.baseline.optimized.expected.toFixed(3)} →{" "}
                    {d.current.optimized.expected.toFixed(3)}
                  </dd>
                </div>
                <div>
                  <dt>Optimal samples</dt>
                  <dd>
                    {(d.baseline.optimized.hit * 100).toFixed(1)}% →{" "}
                    {(d.current.optimized.hit * 100).toFixed(1)}%
                  </dd>
                </div>
                <div>
                  <dt>Compiled depth</dt>
                  <dd>
                    {d.baseline.records[1].program.compiled.depth} →{" "}
                    {d.current.records[1].program.compiled.depth}
                  </dd>
                </div>
                <div>
                  <dt>Compiled gates</dt>
                  <dd>
                    {d.baseline.records[1].program.compiled.instructions.length}{" "}
                    →{" "}
                    {d.current.records[1].program.compiled.instructions.length}
                  </dd>
                </div>
                <div>
                  <dt>Python compute</dt>
                  <dd>
                    {d.parent?.elapsed_seconds?.toFixed(2) ?? "?"} s →{" "}
                    {run.elapsed_seconds?.toFixed(2) ?? "?"} s
                  </dd>
                </div>
              </dl>
              <p>
                Compute time includes search and replay; it is not a
                circuit-only benchmark. Requested p is intent, not independent
                verification of algorithm depth.
              </p>
              {comparison.warning.map((w) => (
                <p key={w} role="status">
                  {w}
                </p>
              ))}
              <button
                onClick={() =>
                  void act(() =>
                    onCompare(
                      d.baseline!.records[1].id,
                      d.current!.records[1].id,
                    ),
                  )
                }
              >
                Compare versions
              </button>
            </>
          ) : (
            <p>
              {["failed", "cancelled", "timed_out"].includes(run.status)
                ? active
                  ? "Latest attempt failed; Agent is still working. The previous result remains available."
                  : "Iteration did not complete. The previous result is retained; inspect the failed attempt before retrying."
                : "Waiting for complete iteration evidence. The previous result remains available."}
            </p>
          )}
          <button onClick={() => void act(() => onInspect(d.parent!.id))}>
            View baseline run
          </button>
        </>
      )}
      {(!d || (!d.baseline && !d.error)) && (
        <p role="status">Reading the preserved baseline…</p>
      )}
      {d?.error && (
        <p role="status">
          Comparison unavailable: {d.error}{" "}
          <button onClick={() => setRetry((n) => n + 1)}>
            Retry comparison
          </button>
        </p>
      )}
      {actionError && <p role="status">{actionError}</p>}
    </section>
  );
}
