export const scientificTaskName = "Harmonic potential · Grid arithmetic";
export function scientificSource(bits = 1) {
  if (![1, 2].includes(bits))
    throw Error("Choose a verified 1- or 2-bit grid.");
  return `import flagquantum as fq
from flagquantum import synth

# Integer-grid potential V = x² + y², in scaled dimensionless units.
# This computes a potential register, not full oscillator dynamics.
BITS = ${bits}

def potential(x: int, y: int) -> int:
    return x * x + y * y

program = synth.synthesize(
    potential,
    inputs={"x": synth.UInt(BITS), "y": synth.UInt(BITS)},
    input_state=synth.InputState.uniform(),
    max_qubits=24,
    memory_limit_bytes=128 * 1024 * 1024,
)
result = fq.run(program)
named = dict(program.probabilities(result, registers=("x", "y", "result")))
expected = {(x, y, x*x+y*y): 1 / (2**BITS)**2
            for x in range(2**BITS) for y in range(2**BITS)}
assert named.keys() == expected.keys()
assert max(abs(named[key] - expected[key]) for key in expected) < 1e-10
print("All", len(named), "grid values match the classical potential.")
print(named)
fq.save("harmonic-grid-${bits}bit.fqx", result.plan, result=result)
`;
}
const grids = [1, 2].map((bits) => ({
  bits,
  source: scientificSource(bits),
  filename: `harmonic-grid-${bits}bit.fqx`,
}));

/** @param {import("../contracts/quantum-workspace").ProgramSnapshot[]} programs */
export function scientificGridRecords(programs) {
  return grids.map(({ bits, source, filename }) => ({
    bits,
    program: programs.find(
      ({ origin, experiment }) =>
        origin?.language === "python" &&
        origin.source === source &&
        origin.execution_status === "completed" &&
        experiment?.filename === filename &&
        experiment.has_result &&
        experiment.python_run?.id === origin.run_id &&
        experiment.python_run.execution_status === "completed" &&
        !!origin.source_hash &&
        experiment.python_run.source_hash === origin.source_hash,
    ),
  }));
}
