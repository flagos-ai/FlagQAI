import { useState } from "react";
import type {
  ProgramSnapshot,
  WorkspaceAction,
} from "../contracts/quantum-workspace";
import {
  scientificGridRecords,
  scientificSource,
  scientificTaskName,
} from "../tasks/scientific-synthesis.mjs";

export function ScientificSynthesis({
  programs,
  dispatch,
}: {
  programs: ProgramSnapshot[];
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const [bits, setBits] = useState(1);
  const records = scientificGridRecords(programs);
  const [small, large] = records.map(({ program }) => program);

  return (
    <section
      className="fq-scientific-synthesis"
      aria-label="Scientific expression to circuit"
    >
      <details>
        <summary>Harmonic potential · x² + y²</summary>
        <p>
          Synthesize reversible arithmetic for a quadratic potential on an
          integer grid. Run each size in Model to check all grid values against
          the classical formula and record the compiled circuit.
        </p>
        <div className="fq-science-grid-controls">
          <label>
            Grid per axis
            <select
              aria-label="Scientific grid size"
              value={bits}
              onChange={(event) => setBits(event.target.value === "2" ? 2 : 1)}
            >
              <option value={1}>2 points · 1 bit</option>
              <option value={2}>4 points · 2 bits</option>
            </select>
          </label>
          <button
            onClick={() =>
              dispatch({
                type: "model",
                model: {
                  name: `${scientificTaskName} · ${bits} bit`,
                  source: scientificSource(bits),
                  language: "python",
                },
                preserveDraft: true,
              })
            }
          >
            Open {bits}-bit model
          </button>
        </div>
        <div className="fq-science-grid-table">
          <table>
            <caption>Resources from saved runs</caption>
            <thead>
              <tr>
                <th scope="col">Grid</th>
                <th scope="col">Qubits</th>
                <th scope="col">Gates</th>
                <th scope="col">Depth</th>
                <th scope="col">Circuit</th>
              </tr>
            </thead>
            <tbody>
              {records.map(({ bits: width, program }) => (
                <tr key={width}>
                  <th scope="row">
                    {2 ** width} × {2 ** width}
                  </th>
                  <td>{program?.compiled.qubits ?? "—"}</td>
                  <td>{program?.compiled.instructions.length ?? "—"}</td>
                  <td>{program?.compiled.depth ?? "—"}</td>
                  <td>
                    {program ? (
                      <button
                        onClick={() => {
                          dispatch({ type: "program", id: program.id });
                          dispatch({ type: "navigate", page: "program" });
                        }}
                      >
                        View circuit
                      </button>
                    ) : (
                      "No saved run"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {small && large && (
          <button
            onClick={() =>
              dispatch({
                type: "compare-experiments",
                left: small.id,
                right: large.id,
              })
            }
          >
            Compare generated circuits
          </button>
        )}
        <details className="fq-science-grid-scope">
          <summary>Scientific scope</summary>
          <p>
            The example evaluates a dimensionless potential register on a
            nonnegative integer grid. A larger grid expands the coordinate
            domain. Oscillator time evolution and eigenstates are outside this
            example.
          </p>
        </details>
      </details>
    </section>
  );
}
