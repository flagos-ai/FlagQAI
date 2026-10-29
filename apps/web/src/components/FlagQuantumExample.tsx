import { useEffect, useId, useRef, useState } from "react";
import saved from "../data/gate-example-results.json";
import { CodeExample } from "./CodeExample";
type Amplitude = {
  state: string;
  real: number;
  imag: number;
  probability: number;
};
type StoredResult = { source: string; qubits: number; before: Amplitude[] } & (
  | { kind: "statevector"; amplitudes: Amplitude[] }
  | {
      kind: "counts";
      counts: Record<string, number>;
      shots: number;
      seed: number;
    }
);
const examples = saved.examples as unknown as Record<string, StoredResult>;
function scalar(value: number) {
  return Math.abs(value) < 1e-7 ? "0" : String(Number(value.toPrecision(6)));
}
function amplitude(real: number, imag: number) {
  const re = scalar(real),
    im = scalar(Math.abs(imag));
  if (im === "0") return re;
  if (re === "0") return (imag < 0 ? "−" : "") + im + "i";
  return re + (imag < 0 ? " − " : " + ") + im + "i";
}
export function FlagQuantumExample({
  name,
  code,
}: {
  name: string;
  code: string;
}) {
  const [shown, setShown] = useState(false),
    id = useId(),
    panel = useRef<HTMLDivElement>(null);
  const result = examples[name],
    available = result?.source === code;
  useEffect(() => {
    if (shown) panel.current?.scrollIntoView({ block: "nearest" });
  }, [shown]);
  return (
    <>
      <CodeExample
        title="FlagQuantum example"
        language="python"
        code={code}
        actions={
          <>
            <span className="fq-precomputed-label">Precomputed</span>
            <button
              disabled={!available}
              aria-expanded={shown}
              aria-controls={id}
              title={
                available
                  ? "Show verified precomputed CPU output instantly; no live execution"
                  : "Saved output needs regeneration for this example"
              }
              onClick={() => setShown(true)}
            >
              Run example
            </button>
          </>
        }
      />
      {!available && (
        <small>
          Saved output needs updating for this version of the example.
        </small>
      )}
      {shown && available && (
        <div
          ref={panel}
          id={id}
          className="fq-example-result"
          role="region"
          aria-label="Precomputed FlagQuantum example result"
        >
          <header>
            <h3>Before / after {name.toUpperCase()}</h3>
            <button
              onClick={() => setShown(false)}
              aria-label="Hide example result"
            >
              ×
            </button>
          </header>
          <p className="fq-result-note">
            Precomputed from the exact example above. Before is the prepared
            input immediately before {name.toUpperCase()}, not the initial zero
            state. No live computation is started.
          </p>
          {result.kind === "counts" && (
            <small>
              {result.shots} shots · seed {result.seed} · computational basis
            </small>
          )}
          <table className="fq-state-comparison">
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">
                  Before {name.toUpperCase()}
                  <small>Amplitude · probability</small>
                </th>
                <th scope="col">
                  After {name.toUpperCase()}
                  <small>
                    {result.kind === "statevector"
                      ? "Amplitude · probability"
                      : "Counts · frequency"}
                  </small>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.before
                .filter(
                  (before) =>
                    before.probability > 1e-12 ||
                    (result.kind === "statevector"
                      ? result.amplitudes.find(
                          (after) => after.state === before.state,
                        )!.probability > 1e-12
                      : (result.counts[before.state] || 0) > 0),
                )
                .map((before) => {
                  const after =
                    result.kind === "statevector"
                      ? result.amplitudes.find(
                          (row) => row.state === before.state,
                        )!
                      : null;
                  const changed =
                    after &&
                    (Math.abs(after.real - before.real) > 1e-6 ||
                      Math.abs(after.imag - before.imag) > 1e-6);
                  return (
                    <tr key={before.state}>
                      <td>
                        <code>|{before.state}⟩</code>
                      </td>
                      <td>
                        <code>{amplitude(before.real, before.imag)}</code>
                        <small>{(before.probability * 100).toFixed(2)}%</small>
                      </td>
                      <td className={changed ? "fq-amplitude-changed" : ""}>
                        {after ? (
                          <>
                            <code>{amplitude(after.real, after.imag)}</code>
                            <small>
                              {(after.probability * 100).toFixed(2)}%
                            </small>
                          </>
                        ) : result.kind === "counts" ? (
                          <>
                            <code>{result.counts[before.state] || 0}</code>
                            <span className="fq-result-frequency">
                              <progress
                                value={result.counts[before.state] || 0}
                                max={result.shots}
                                aria-label={before.state + " frequency"}
                              />
                              <small>
                                {(
                                  (100 * (result.counts[before.state] || 0)) /
                                  result.shots
                                ).toFixed(2)}
                                %
                              </small>
                            </span>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <small>
            q0 is the leftmost bit. States negligible on both sides are omitted;
            displayed values are rounded.
          </small>
          {result.kind === "statevector" ? (
            <p className="fq-result-note">
              Amplitude changes are highlighted. A phase change can leave
              probabilities unchanged.
            </p>
          ) : (
            <p className="fq-result-note">
              After shows repeated measurement outcomes, not a statevector of
              one collapsed shot. A fresh execution can produce different
              counts.
            </p>
          )}
          <footer>
            Verified with FlagQuantum {saved.sdkVersion} · PyTorch{" "}
            {saved.torchVersion} · CPU
          </footer>
        </div>
      )}
    </>
  );
}
