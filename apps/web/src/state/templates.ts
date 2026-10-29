import type { Model } from "../contracts/quantum-workspace";
const qasm = (n: number, gates: string) =>
  `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[${n}];\ncreg c[${n}];\n${gates}\n${Array.from({ length: n }, (_, i) => `measure q[${i}] -> c[${i}];`).join("\n")}`;
export const basicExamples = {
  "Bell State": qasm(2, "h q[0];\ncx q[0], q[1];"),
  "GHZ State": qasm(3, "h q[0];\ncx q[0],q[1];\ncx q[1],q[2];"),
  "X State": qasm(1, "x q[0];"),
};
/* Small, transparent generators. No external model or arbitrary code execution. */
export function arithmeticModel(multiplier = 3, offset = 2) {
  if (
    !Number.isInteger(multiplier) ||
    multiplier < 1 ||
    multiplier > 7 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 3
  )
    throw Error("Use integer multiplier 1–7 and offset 0–3.");
  const resultWidth = Math.max(
      1,
      Math.ceil(Math.log2(multiplier * 3 + offset + 1)),
    ),
    n = 4 + resultWidth;
  const out = [
    "OPENQASM 2.0;",
    'include "qelib1.inc";',
    `qreg q[${n}];`,
    `creg c[${n}];`,
    "// @register x 0 1",
    "// @register y 2 3",
    `// @register res ${Array.from({ length: resultWidth }, (_, i) => i + 4).join(" ")}`,
    "// @module main | Quantum arithmetic",
    "// @module main/prepare | Input preparation",
    "// @module main/prepare/superposition | Hadamard transform",
    "h q[0];",
    "h q[1];",
    `// @module main/prepare/assign_y | Assign y = ${offset}`,
  ];
  for (let bit = 0; bit < 2; bit++)
    if ((offset >> bit) & 1) out.push(`x q[${bit + 2}];`);
  out.push(`// @module main/arithmetic | res = ${multiplier} * x + ${offset}`);
  for (let x = 0; x < 4; x++) {
    out.push(`// @module main/arithmetic/case_${x} | x = ${x}`);
    out.push(`// @module main/arithmetic/case_${x}/select | Select input ${x}`);
    const neg = [0, 1].filter((b) => !((x >> b) & 1));
    neg.forEach((b) => out.push(`x q[${b}];`));
    const value = multiplier * x + offset;
    out.push(
      `// @module main/arithmetic/case_${x}/write | XOR output ${value}`,
    );
    for (let bit = 0; bit < resultWidth; bit++)
      if ((value >> bit) & 1) out.push(`ccx q[0], q[1], q[${4 + bit}];`);
    out.push(`// @module main/arithmetic/case_${x}/restore | Restore input`);
    neg
      .slice()
      .reverse()
      .forEach((b) => out.push(`x q[${b}];`));
  }
  out.push("// @module measurement | Measurement");
  for (let i = 0; i < n; i++) out.push(`measure q[${i}] -> c[${i}];`);
  return {
    name: `Quantum Arithmetic · ${multiplier}x + ${offset}`,
    description: `Prepare x in a uniform superposition over 0, 1, 2, 3. Set y = ${offset}. Coherently compute res = ${multiplier}x + y into an initially zero output register, then measure all qubits. The generated reversible lookup circuit supports this fixed 2-bit input and constant y.`,
    source: out.join("\n"),
    multiplier,
    offset,
  };
}
export function interpretPrompt(prompt: string) {
  const t = prompt.toLowerCase();
  if (/arithmetic|算术|叠加.*计算|\d\s*\*?\s*x/.test(t)) {
    const m = t.match(/(-?\d+)\s*\*?\s*x\s*\+\s*(-?\d+)/);
    if (
      m &&
      (Number(m[1]) < 1 ||
        Number(m[1]) > 7 ||
        Number(m[2]) < 0 ||
        Number(m[2]) > 3)
    )
      return null;
    return {
      ...arithmeticModel(m ? Number(m[1]) : 3, m ? Number(m[2]) : 2),
      explanation:
        "Generated from the bounded quantum arithmetic template. x is 2 bits; y is a fixed constant. Review the OpenQASM before applying.",
    };
  }
  if (/ghz/.test(t))
    return {
      name: "GHZ State",
      source: basicExamples["GHZ State"],
      description: "Create a three-qubit GHZ state using H and two CX gates.",
      explanation: "Matched the GHZ template.",
    };
  if (/bell|entangle|纠缠|贝尔/.test(t))
    return {
      name: "Bell State",
      source: basicExamples["Bell State"],
      description: "Create a Bell pair using H and CX.",
      explanation: "Matched the Bell-state template.",
    };
  return null;
}

export const examples: Model[] = [
  ...Object.entries(basicExamples).map(([name, source]) => ({ name, source })),
  arithmeticModel(),
];
