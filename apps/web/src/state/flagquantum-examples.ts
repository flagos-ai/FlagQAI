// Native Circuit methods take qubit operands before angle parameters.
export function flagQuantumExample(
  name: string,
  qubits: number,
  parameters: string[],
) {
  const imports = [
    "import flagquantum as fq",
    ...(parameters.length || name === "ch" ? ["from math import pi"] : []),
  ];
  const body = [
    `# Qubits start in |${"0".repeat(qubits)}>.`,
    `circuit = fq.Circuit(${qubits})`,
  ];
  const prepare = (explanation: string, operation: string) =>
    body.push(
      "",
      `# Demo preparation, not part of ${name.toUpperCase()}: ${explanation}`,
      operation,
    );
  if (name === "ccx")
    prepare("set both controls to 1 so the target flips.", "circuit.x(0).x(1)");
  else if (name === "cswap")
    prepare(
      "enable the control and make the targets different.",
      "circuit.x(0).x(1)",
    );
  else if (name === "swap")
    prepare(
      "make the two states different so the exchange is visible.",
      "circuit.x(0)",
    );
  else if (name.startsWith("c")) {
    prepare(
      "set the first qubit to 1 to enable the controlled operation.",
      "circuit.x(0)",
    );
    if (["cz", "cp", "cu1", "crz"].includes(name))
      body.push(
        "# Prepare the target in superposition to expose its relative phase.",
        "circuit.h(1)",
      );
  } else if (["z", "s", "sdg", "t", "tdg", "p", "u1", "rz"].includes(name))
    prepare(
      "use superposition so the relative phase is visible.",
      "circuit.h(0)",
    );
  else if (name === "rzz")
    prepare(
      "superpose both qubits to expose the ZZ phase interaction.",
      "circuit.h(0).h(1)",
    );
  else if (name === "measure")
    prepare(
      "create a state with both possible measurement outcomes.",
      "circuit.h(0)",
    );

  if (["ch", "cu1", "cu3"].includes(name)) {
    body.push(
      "",
      `# Apply ${name.toUpperCase()} using equivalent native gates, not preparation.`,
    );
    if (name === "ch")
      body.push(
        "# H = Ry(pi/2) P(pi); apply the controlled factors.",
        "circuit.cphase(0, 1, pi).cry(0, 1, pi / 2)",
      );
    if (name === "cu1")
      body.push(
        "# Controlled U1 is a controlled phase; angles are in radians.",
        "circuit.cphase(0, 1, pi / 2)",
      );
    if (name === "cu3")
      body.push(
        "# U3(theta, phi, lambda) = P(phi) Ry(theta) P(lambda).",
        "theta, phi, lbd = pi / 2, 0, pi / 4",
        "circuit.cphase(0, 1, lbd)",
        "circuit.cry(0, 1, theta)",
        "circuit.cphase(0, 1, phi)",
      );
  } else if (name !== "measure") {
    const method =
      (
        { id: "i", p: "phase", cp: "cphase", u: "u3" } as Record<string, string>
      )[name] || name;
    const args = [
      ...Array.from({ length: qubits }, (_, i) => String(i)),
      ...parameters.map((_, i) => ["pi / 2", "0", "pi / 4"][i]),
    ];
    body.push(
      "",
      `# Apply ${name.toUpperCase()}${method !== name ? ` (Circuit.${method} in the Python SDK)` : ""}.${parameters.length ? " Angles are in radians." : ""}`,
      `circuit.${method}(${args.join(", ")})`,
    );
  }
  const measurement = name === "measure";
  return [
    ...imports,
    "",
    ...body,
    "",
    ...(measurement
      ? [
          "# Measure q0 in the computational basis: 1024 shots, reproducible seed.",
          "result = fq.run(",
          "    circuit, outputs=fq.counts(qubits=[0]),",
          "    options=fq.ExecutionOptions(shots=1024, seed=42),",
          ")",
        ]
      : [
          "# Simulate and inspect amplitudes, including relative phases.",
          "result = fq.run(circuit)",
        ]),
    measurement ? "print(result.counts)" : "print(result.statevector())",
    "",
    "# Save this executed example for circuit and result inspection in the workbench.",
    `fq.save("${name}.fqx", result.plan, result=result)`,
  ].join("\n");
}
