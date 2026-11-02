import { ResearchRecord } from "./ResearchRecord";
import type { ResearchTurn } from "../state/research-record";
import { iterationPrompt } from "../state/qaoa-iteration";
import { CloseButton } from "./CloseButton";
import { useEffect, useState } from "react";
import type { PythonRun } from "../api/python-runs";
import { readExperiment, experimentFileURL } from "../api/experiments";
import { qaoaFiles, qaoaOutcome } from "../state/qaoa-outcome";
import { Modal } from "./Modal";
import { UIIcon } from "./UIIcon";
import { CodeExample } from "./CodeExample";

type Summary = Awaited<ReturnType<typeof qaoaOutcome>>;
export function QaoaOutcome({
  run,
  onCompare,
  onCircuit,
  onPrepare,
  researchTurns,
  onInspect,
}: {
  run: PythonRun;
  onCompare: (left: string, right: string) => Promise<void>;
  onCircuit: (id: string) => Promise<void>;
  onPrepare: (prompt: string) => void;
  researchTurns: ResearchTurn[];
  onInspect: (id: string) => Promise<void>;
}) {
  const [state, setState] = useState<{
    key: string;
    data?: Summary;
    error?: string;
  }>({ key: "" });
  const [retry, setRetry] = useState(0),
    [code, setCode] = useState(false),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false);
  const [research, setResearch] = useState(false);
  const [iteration, setIteration] = useState(false),
    [layers, setLayers] = useState(2),
    [shots, setShots] = useState(4096),
    [seed, setSeed] = useState(42),
    [prepared, setPrepared] = useState(false);
  const key =
    run.id + ":" + run.source_hash + ":" + JSON.stringify(run.experiments);
  useEffect(() => {
    const controller = new AbortController();
    setState({ key });
    void (async () => {
      try {
        const refs = qaoaFiles.map((name) =>
          run.experiments?.find((e) => e.filename === name),
        );
        if (refs.some((r) => !r))
          throw Error("The saved QAOA archive set is incomplete.");
        const records = await Promise.all(
          refs.map((ref) => readExperiment(ref!.id, controller.signal)),
        );
        const data = await qaoaOutcome(run, records);
        if (!controller.signal.aborted) setState({ key, data });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            key,
            error: error instanceof Error ? error.message : String(error),
          });
      }
    })();
    return () => controller.abort();
  }, [key, retry]);
  const s = state.key === key ? state.data : undefined;
  const act = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="fq-qaoa-outcome" aria-label="QAOA outcome">
      <header>
        <strong>QAOA · Max-Cut</strong>
        <small>
          {s
            ? `${s.n} qubits · ${s.edges} ${s.weighted ? "weighted edges" : "edges"} · optimum ${s.optimum}`
            : "Checking saved evidence…"}
        </small>
      </header>
      {state.key === key && state.error ? (
        <p role="status">
          Summary unavailable: {state.error}{" "}
          <button onClick={() => setRetry((n) => n + 1)}>Retry summary</button>
        </p>
      ) : !s ? (
        <p role="status">Reading archives and checking the code version.</p>
      ) : (
        <>
          <dl className="fq-qaoa-metrics">
            <div>
              <dt>{s.weighted ? "Expected cut weight" : "Expected cut"}</dt>
              <dd>
                {s.baseline.expected.toFixed(2)} <span>→</span>{" "}
                {s.optimized.expected.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Optimal samples</dt>
              <dd>
                {(s.baseline.hit * 100).toFixed(1)}% <span>→</span>{" "}
                {(s.optimized.hit * 100).toFixed(1)}%
              </dd>
            </div>
          </dl>
          <div className="fq-qaoa-replay" data-match={s.replayMatches}>
            <UIIcon name={s.replayMatches ? "check" : "info"} size={13} />
            <span>
              {s.replayMatches
                ? "Seeded replay matches saved results"
                : "Replay differs or cannot be verified"}
            </span>
          </div>
          <small>
            {s.optimized.shots.toLocaleString("en-US")} shots · seed{" "}
            {String(s.optimized.seed ?? "unrecorded")} · {s.device} /{" "}
            {s.backend}
          </small>
          <nav aria-label="QAOA result actions">
            <button onClick={() => setResearch(true)}>
              View research record
            </button>
            <button
              onClick={() => {
                setShots(s.optimized.shots);
                setSeed(
                  typeof s.optimized.seed === "number" ? s.optimized.seed : 42,
                );
                setActionError("");
                setIteration(true);
              }}
            >
              Iterate parameters
            </button>
            <button onClick={() => setCode(true)}>View code</button>
            <button
              disabled={busy}
              onClick={() => void act(() => onCircuit(s.records[1].id))}
            >
              View circuit
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void act(() => onCompare(s.records[1].id, s.records[2].id))
              }
            >
              Check replay
            </button>
            <a
              href={experimentFileURL(s.records[1].id)}
              download={qaoaFiles[1]}
            >
              Download .fqx <UIIcon name="download" size={12} />
            </a>
          </nav>
          <details className="fq-qaoa-evidence">
            <summary>Evidence · code {s.sourceHash.slice(0, 8)}</summary>
            <p>
              Metrics calculated from saved probabilities and counts using the
              literal EDGES graph in this run’s source. Ideal simulation; finite
              samples; no quantum advantage claim.
            </p>
            <dl>
              <div>
                <dt>Run</dt>
                <dd>{run.id}</dd>
              </div>
              <div>
                <dt>Source SHA-256</dt>
                <dd>{s.sourceHash}</dd>
              </div>
              <div>
                <dt>Python compute</dt>
                <dd>
                  {run.elapsed_seconds == null
                    ? "Unrecorded"
                    : `${run.elapsed_seconds.toFixed(2)} s`}{" "}
                  · SDK {run.runtime?.sdk_version || "unrecorded"}
                </dd>
              </div>
              <div>
                <dt>Replay probability max Δ</dt>
                <dd>{s.probabilityDelta.toExponential(2)} · tolerance 1e-6</dd>
              </div>
            </dl>
            <ul>
              {s.records.map((r) => (
                <li key={r.id}>
                  <a
                    href={experimentFileURL(r.id)}
                    download={r.program.experiment!.filename}
                  >
                    {r.program.experiment!.filename}
                  </a>
                  <code title="Archive SHA-256">
                    {r.program.experiment!.sha256}
                  </code>
                </li>
              ))}
            </ul>
            <p>
              Bound to the saved run, independent of your current editor draft.
              Replay checks program identity, seed, shots, exact counts and
              probability tolerance in the recorded runtime.
            </p>
          </details>
        </>
      )}
      {prepared && (
        <p role="status">
          Iteration request added to the composer. Review before sending.
        </p>
      )}
      {actionError && <p role="status">{actionError}</p>}
      {research && (
        <ResearchRecord
          runId={run.id}
          turns={researchTurns}
          onClose={() => setResearch(false)}
          onCompare={onCompare}
          onInspect={onInspect}
          onCircuit={onCircuit}
        />
      )}
      {iteration && s && (
        <Modal
          className="fq-qaoa-iterate-dialog"
          label="New QAOA iteration"
          onClose={() => setIteration(false)}
        >
          <header>
            <h2>New QAOA iteration</h2>
            <CloseButton
              label="Close iteration settings"
              onClick={() => setIteration(false)}
            />
          </header>
          <p>
            Baseline: expected cut {s.optimized.expected.toFixed(3)} · code{" "}
            {s.sourceHash.slice(0, 8)}. Saved code and current drafts are
            retained.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                onPrepare(iterationPrompt(run, s, layers, shots, seed));
                setPrepared(true);
                setIteration(false);
                setActionError("");
              } catch (error) {
                setActionError(
                  error instanceof Error ? error.message : String(error),
                );
              }
            }}
          >
            <label>
              QAOA layers p
              <input
                aria-label="QAOA layers"
                type="number"
                min="1"
                max="8"
                required
                value={Number.isNaN(layers) ? "" : layers}
                onChange={(e) => setLayers(e.target.valueAsNumber)}
              />
            </label>
            <label>
              Shots
              <input
                aria-label="Iteration shots"
                type="number"
                min="1"
                max="1000000"
                required
                value={Number.isNaN(shots) ? "" : shots}
                onChange={(e) => setShots(e.target.valueAsNumber)}
              />
            </label>
            <label>
              Seed
              <input
                aria-label="Iteration seed"
                type="number"
                min="0"
                max="4294967295"
                required
                value={Number.isNaN(seed) ? "" : seed}
                onChange={(e) => setSeed(e.target.valueAsNumber)}
              />
            </label>
            <p>
              Adds a request to the composer without sending or running
              anything.
            </p>
            {actionError && <p role="status">{actionError}</p>}
            <button className="primary" type="submit">
              Prepare iteration
            </button>
          </form>
        </Modal>
      )}
      {code && s && (
        <Modal
          className="fq-qaoa-code"
          label="QAOA saved code"
          onClose={() => setCode(false)}
        >
          <header>
            <h2>Saved run code</h2>
            <CloseButton
              label="Close saved code"
              onClick={() => setCode(false)}
            />
          </header>
          <p>Read-only · {s.sourceHash.slice(0, 12)} · editor draft retained</p>
          <CodeExample
            title={run.name}
            code={run.source}
            language="python"
            lineNumbers
          />
        </Modal>
      )}
    </section>
  );
}
