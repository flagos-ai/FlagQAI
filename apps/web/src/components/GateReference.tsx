import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { useRef, useState } from "react";
import { FlagQuantumExample } from "./FlagQuantumExample";
import { CodeExample } from "./CodeExample";
import { flagQuantumExample } from "../state/flagquantum-examples";
import { gateReference } from "../state/gate-reference";
import { GateSymbol, MeasurementSymbol } from "./CircuitSymbols";

export function GateReference({
  initialGate,
  onClose,
}: {
  initialGate: string;
  onClose: () => void;
}) {
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [family, setFamily] = useState("All"),
    [selected, setSelected] = useState(initialGate || "h");
  const matches = gateReference.filter(
    (g) =>
      (family === "All" || g.family === family) &&
      `${g.name} ${g.title} ${g.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const gate = matches.find((g) => g.name === selected) || matches[0];
  return (
    <Modal
      className="fq-gate-reference"
      labelledBy="fq-gate-reference-title"
      initialFocus={search}
      onClose={onClose}
    >
      <header>
        <div>
          <h2 id="fq-gate-reference-title">Gate reference</h2>
          <small>
            Supported workspace gates · symbols, parameters and examples
          </small>
        </div>
        <CloseButton onClick={onClose} label="Close gate reference" />
      </header>
      <div className="fq-reference-search">
        <input
          ref={search}
          aria-label="Search gates"
          placeholder="Search name or operation…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Gate category"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
        >
          {["All", ...new Set(gateReference.map((g) => g.family))].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </div>
      <div className="fq-reference-body">
        <nav aria-label="Supported gates">
          <small>{matches.length} results</small>
          {matches.map((g) => (
            <button
              key={g.name}
              aria-pressed={gate?.name === g.name}
              className={[
                gate?.name === g.name ? "selected" : "",
                g.name === "measure" ? "fq-gate-long-name" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelected(g.name)}
            >
              <i style={{ background: g.color }} />
              <b>{g.name.toUpperCase()}</b>
              <span>{g.name === "measure" ? "Measurement" : g.title}</span>
            </button>
          ))}
        </nav>
        {gate ? (
          <article key={gate.name}>
            <div className="fq-reference-overview">
              <div className="fq-reference-preview">
                <svg
                  viewBox="0 0 220 160"
                  role="group"
                  aria-label={gate.title + " circuit symbol"}
                >
                  <g transform={`translate(0, ${(3 - gate.qubits) * 20})`}>
                    {Array.from({ length: gate.qubits }, (_, i) => (
                      <line
                        key={i}
                        x1={24}
                        x2={196}
                        y1={40 + i * 40}
                        y2={40 + i * 40}
                        stroke="#64646c"
                        strokeWidth={1}
                      />
                    ))}
                    {gate.name === "measure" ? (
                      <MeasurementSymbol
                        x={110}
                        y={40}
                        label="q0"
                        wires={[0]}
                        onSelect={() => {}}
                      />
                    ) : (
                      <GateSymbol
                        gate={{
                          name: gate.name,
                          wires: Array.from(
                            { length: gate.qubits },
                            (_, i) => i,
                          ),
                          params: Object.fromEntries(
                            gate.parameters.map((name, index) => [
                              name,
                              [Math.PI / 2, 0, Math.PI / 4][index],
                            ]),
                          ),
                        }}
                        index={0}
                        x={110}
                        width={90}
                        y={(wire) => 40 + wire * 40}
                        bus={false}
                        onSelect={() => {}}
                      />
                    )}
                  </g>
                </svg>
              </div>
              <div className="fq-reference-description">
                <small style={{ color: gate.color }}>{gate.family}</small>
                <h2>
                  {gate.name.toUpperCase()} · {gate.title}
                </h2>
                <p>{gate.description}</p>
                <dl>
                  <div>
                    <dt>Qubits</dt>
                    <dd>{gate.qubits}</dd>
                  </div>
                  <div>
                    <dt>Parameters</dt>
                    <dd>
                      {gate.parameters.length
                        ? gate.parameters.join(", ") + " · radians"
                        : "None"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <FlagQuantumExample
              name={gate.name}
              code={flagQuantumExample(gate.name, gate.qubits, gate.parameters)}
            />
            <small>
              Python SDK · default execution settings.{" "}
              {gate.name === "measure"
                ? "Returns sampled counts."
                : "Returns amplitudes so phase changes remain visible."}
            </small>
            <CodeExample
              title="OpenQASM example"
              language="qasm"
              code={gate.example}
            />
            <small>
              Snippet for a declared q register
              {gate.name === "measure" ? " and c classical register" : ""}.
            </small>
            <details>
              <summary>Mathematical definition</summary>
              <pre>{gate.math}</pre>
              <small>
                Tensor expressions use operand order. Displayed qubit and bit
                ordering follows the workspace.
              </small>
            </details>
            <footer>
              References:{" "}
              <a
                href="https://openqasm.com/language/standard_library.html"
                target="_blank"
                rel="noreferrer"
              >
                OpenQASM standard library ↗
              </a>{" "}
              ·{" "}
              <a
                href="https://quantum.cloud.ibm.com/docs/en/api/qiskit/circuit_library"
                target="_blank"
                rel="noreferrer"
              >
                Gate definitions ↗
              </a>
            </footer>
          </article>
        ) : (
          <div className="fq-empty">
            <h3>No matching gates</h3>
            <p>Try another name or choose All categories.</p>
            <button
              onClick={() => {
                setQuery("");
                setFamily("All");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
