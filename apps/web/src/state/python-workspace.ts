import type { ExperimentImport } from "../contracts/quantum-workspace";

export const pythonExample = `import flagquantum as fq

circuit = fq.Circuit(2)
circuit.h(0)
circuit.cx(0, 1)

result = fq.run(
    circuit,
    outputs=fq.counts(),
    options=fq.ExecutionOptions(shots=1024, seed=42),
)
print("Bell pair measurement:", result.counts)

# Save the exact executed circuit and result. The workbench collects this file.
fq.save("bell.fqx", result.plan, result=result)
`;

export function matchesPythonExperiment(
  run: { id: string; source: string; source_hash?: string },
  reference: { id: string; sha256: string },
  record: ExperimentImport,
): boolean {
  const origin = record.program.origin;
  return (
    record.id === reference.id &&
    record.program.experiment?.sha256 === reference.sha256 &&
    origin?.run_id === run.id &&
    origin.source === run.source &&
    (!run.source_hash || origin.source_hash === run.source_hash)
  );
}

// Migrate only the legacy example's standalone helper import and publication call.
// Unknown helper usage is left untouched instead of guessing at Python semantics.
export function migrateLegacyPythonExample(source: string): string {
  const imported = /^from flagquantum_web import publish[ \t]*\r?$/m;
  const call =
    /^publish\(circuit, result, name=(?:"[^"\n]*"|'[^'\n]*')\)[ \t]*\r?$/m;
  const compactHeader = (text: string) =>
    text.replace(
      /^(import flagquantum as fq\r?\n)(?:[ \t]*\r?\n){2,}(?=circuit = fq\.Circuit\()/,
      "$1\n",
    );
  if (!imported.test(source) || !call.test(source)) {
    return source.includes('fq.save("bell.fqx", result.plan, result=result)')
      ? compactHeader(source)
      : source;
  }
  const remaining = source.replace(imported, "").replace(call, "");
  if (/\bpublish\b/.test(remaining.replace(/^\s*#.*$/gm, ""))) return source;
  return compactHeader(
    source
      .replace(/^from flagquantum_web import publish[ \t]*\r?\n/m, "")
      .replace(call, 'fq.save("bell.fqx", result.plan, result=result)')
      .replace(
        "# Send the actual SDK circuit and results to this workbench.",
        "# Save the exact executed circuit and result. The workbench collects this file.",
      ),
  );
}
