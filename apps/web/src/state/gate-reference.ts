import { gateFamilies, gateStyle } from "./gate-style";

export type GateReferenceEntry = {
  name: string;
  title: string;
  qubits: number;
  parameters: string[];
  description: string;
  math: string;
  example: string;
  family: string;
  color: string;
};
const entries: [string, string, number, string[], string, string][] = [
  [
    "id",
    "Identity",
    1,
    [],
    "Leaves the qubit unchanged.",
    "I = [[1, 0], [0, 1]]",
  ],
  ["i", "Identity alias", 1, [], "Alias of ID.", "I² = I"],
  [
    "h",
    "Hadamard",
    1,
    [],
    "Creates equal superposition from a computational basis state.",
    "H = [[1, 1], [1, −1]] / √2",
  ],
  [
    "x",
    "Pauli X",
    1,
    [],
    "Exchanges zero and one amplitudes.",
    "X = [[0, 1], [1, 0]]",
  ],
  [
    "y",
    "Pauli Y",
    1,
    [],
    "Flips the basis state with a phase change.",
    "Y = [[0, −i], [i, 0]]",
  ],
  [
    "z",
    "Pauli Z",
    1,
    [],
    "Reverses the sign of the one amplitude.",
    "Z = diag(1, −1)",
  ],
  [
    "s",
    "S phase",
    1,
    [],
    "Applies a quarter-turn phase to the one amplitude.",
    "S = diag(1, i)",
  ],
  ["sdg", "Inverse S", 1, [], "Undoes S.", "S† = diag(1, −i)"],
  [
    "t",
    "T phase",
    1,
    [],
    "Applies a π/4 phase to the one amplitude.",
    "T = diag(1, exp(iπ/4))",
  ],
  ["tdg", "Inverse T", 1, [], "Undoes T.", "T† = diag(1, exp(−iπ/4))"],
  [
    "sx",
    "Square root of X",
    1,
    [],
    "Two applications produce X.",
    "SX = [[1+i, 1−i], [1−i, 1+i]] / 2",
  ],
  [
    "sxdg",
    "Inverse square root of X",
    1,
    [],
    "Undoes SX.",
    "SX† = [[1−i, 1+i], [1+i, 1−i]] / 2",
  ],
];
for (const axis of ["x", "y", "z"]) {
  entries.push([
    "r" + axis,
    "Rotation about " + axis.toUpperCase(),
    1,
    ["θ"],
    "Rotates the state about the " +
      axis.toUpperCase() +
      " axis of the Bloch sphere.",
    "R" + axis + "(θ) = exp(−iθ" + axis.toUpperCase() + "/2)",
  ]);
}
entries.push(
  [
    "p",
    "Phase",
    1,
    ["λ"],
    "Adjusts the relative phase of the one amplitude.",
    "P(λ) = diag(1, exp(iλ))",
  ],
  [
    "u1",
    "One-parameter unitary",
    1,
    ["λ"],
    "Phase gate alias.",
    "U1(λ) = P(λ)",
  ],
  [
    "u2",
    "Two-parameter unitary",
    1,
    ["φ", "λ"],
    "General U gate with θ fixed at π/2.",
    "U2(φ, λ) = U(π/2, φ, λ)",
  ],
  [
    "u3",
    "Three-parameter unitary",
    1,
    ["θ", "φ", "λ"],
    "Parameterized single-qubit transformation.",
    "U(θ,φ,λ) = [[cos(θ/2), −exp(iλ)sin(θ/2)],\n [exp(iφ)sin(θ/2), exp(i(φ+λ))cos(θ/2)]]",
  ],
  [
    "u",
    "General unitary",
    1,
    ["θ", "φ", "λ"],
    "Same parameterization as U3 in this workspace.",
    "U(θ,φ,λ) = U3(θ,φ,λ)",
  ],
);
for (const base of ["x", "y", "z", "h", "p", "rx", "ry", "rz", "u1", "u3"]) {
  const original = entries.find((gate) => gate[0] === base)!;
  entries.push([
    "c" + base,
    "Controlled " + base.toUpperCase(),
    2,
    original[3],
    "Applies " +
      base.toUpperCase() +
      " to the second qubit when the first is one.",
    "C(V) = |0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ V\nFirst operand: control. Second operand: target.",
  ]);
}
entries.push(
  ["swap", "Swap", 2, [], "Exchanges two qubit states.", "|a,b⟩ → |b,a⟩"],
  [
    "ccx",
    "Toffoli",
    3,
    [],
    "Flips the third qubit when both controls are one.",
    "|a,b,c⟩ → |a,b,c ⊕ (a AND b)⟩",
  ],
  [
    "cswap",
    "Fredkin",
    3,
    [],
    "Swaps the final two qubits when the first is one.",
    "|0,a,b⟩ → |0,a,b⟩\n|1,a,b⟩ → |1,b,a⟩",
  ],
);
for (const axis of ["x", "y", "z"]) {
  entries.push([
    "r" + axis + axis,
    axis.toUpperCase() + axis.toUpperCase() + " interaction",
    2,
    ["θ"],
    "Couples two qubits through a joint " +
      axis.toUpperCase() +
      axis.toUpperCase() +
      " rotation.",
    "R" +
      axis +
      axis +
      "(θ) = exp(−iθ(" +
      axis.toUpperCase() +
      " ⊗ " +
      axis.toUpperCase() +
      ")/2)",
  ]);
}
entries.push([
  "measure",
  "Computational-basis measurement",
  1,
  [],
  "Samples zero or one and records the outcome in a classical bit.",
  "P(0) = |α|², P(1) = |β|² for α|0⟩ + β|1⟩.\nThe measured qubit collapses to the sampled basis state.",
]);
export const gateReference: GateReferenceEntry[] = entries.map(
  ([name, title, qubits, parameters, description, math]) => {
    const style =
      name === "measure" ? gateFamilies.measurement : gateStyle(name);
    const args = parameters.length
      ? "(" +
        parameters.map((_, i) => ["pi/2", "0", "pi/4"][i]).join(", ") +
        ")"
      : "";
    return {
      name,
      title,
      qubits,
      parameters,
      description,
      math,
      family: style.label,
      color: style.color,
      example:
        name === "measure"
          ? "measure q[0] -> c[0];"
          : name +
            args +
            " " +
            Array.from({ length: qubits }, (_, i) => "q[" + i + "]").join(
              ", ",
            ) +
            ";",
    };
  },
);
