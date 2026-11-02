import type { PythonRun } from "../api/python-runs";
import type { qaoaOutcome } from "./qaoa-outcome";
type Summary = Awaited<ReturnType<typeof qaoaOutcome>>;
export type QaoaIteration = {
  version: 1;
  run: string;
  source: string;
  archive: string;
  sha256: string;
  layers: number;
  shots: number;
  seed: number;
};
export const iterationPrefix = "# FLAGQAI_QAOA_ITERATION=";
export function validateIteration(value: unknown): QaoaIteration {
  const v = value as QaoaIteration;
  if (
    !v ||
    v.version !== 1 ||
    ![v.run, v.archive].every(
      (x) => typeof x === "string" && /^[a-zA-Z0-9-]{1,128}$/.test(x),
    ) ||
    ![v.source, v.sha256].every(
      (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x),
    ) ||
    !Number.isInteger(v.layers) ||
    v.layers < 1 ||
    v.layers > 8 ||
    !Number.isInteger(v.shots) ||
    v.shots < 1 ||
    v.shots > 1000000 ||
    !Number.isInteger(v.seed) ||
    v.seed < 0 ||
    v.seed > 4294967295
  )
    throw Error(
      "Use 1–8 layers, 1–1,000,000 shots and a seed from 0 to 4,294,967,295 with a saved baseline.",
    );
  return v;
}
export function iterationFromSource(source: string) {
  const lines = source
    .split("\n")
    .filter((line) => line.startsWith(iterationPrefix));
  if (!lines.length) return null;
  if (lines.length !== 1)
    throw Error("Multiple iteration baseline references were recorded.");
  return validateIteration(JSON.parse(lines[0].slice(iterationPrefix.length)));
}
export function iterationPrompt(
  run: PythonRun,
  summary: Summary,
  layers: number,
  shots: number,
  seed: number,
) {
  const info = summary.records[1].program.experiment!;
  const ref = validateIteration({
    version: 1,
    run: run.id,
    source: summary.sourceHash,
    archive: info.id,
    sha256: info.sha256,
    layers,
    shots,
    seed,
  });
  return `Iterate the saved QAOA Max-Cut experiment, preserving its baseline and all current editor drafts.
Baseline run: ${ref.run}; source SHA-256: ${ref.source}; optimized archive: ${ref.archive}; archive SHA-256: ${ref.sha256}.
Read the baseline code with workbench python.read --run-id and its artifact with experiment.read --experiment-id. Verify these identities before making changes. Create a separate Python model; do not overwrite the baseline or my drafts.
Requested QAOA layers p=${layers}, shots=${shots}, seed=${seed}. Keep the same graph and CPU/PyTorch runtime, no backend fallback. Optimize the new circuit with a bounded search; state search limits and parameter sharing, without claiming a global optimum. Compare against the previous optimized archive, not just uniform superposition. Report actual cut expectation, sampled optimum rate, compiled depth, gate count and total Python compute time; report regressions honestly.
Include this exact lineage comment once in the new Python source:
${iterationPrefix}${JSON.stringify(ref)}
Save a new run's results as 01-maxcut-baseline.fqx, 02-maxcut-qaoa.fqx and 03-maxcut-replay.fqx. Keep EDGES as a literal list/tuple of integer pairs for the outcome summary. Run the real SDK and check archive replay with the recorded seed; never fabricate results. Preserve failures and do not rerun the baseline. Present the new circuit and compare the previous optimized archive with the new optimized archive. Do not silently change the requested settings.`;
}
export function compareQaoaVersions(
  ref: QaoaIteration,
  parent: PythonRun,
  baseline: Summary,
  run: PythonRun,
  current: Summary,
) {
  validateIteration(ref);
  if (
    parent.id !== ref.run ||
    parent.source_hash !== ref.source ||
    baseline.sourceHash !== ref.source ||
    baseline.records[1].id !== ref.archive ||
    baseline.records[1].program.experiment!.sha256 !== ref.sha256 ||
    run.id === parent.id ||
    current.graph !== baseline.graph
  )
    throw Error(
      "The baseline identity or graph does not match this iteration.",
    );
  const warning = [];
  if (
    current.optimized.shots !== ref.shots ||
    current.optimized.seed !== ref.seed
  )
    warning.push("Recorded shots or seed differ from the request.");
  if (
    current.optimized.shots !== baseline.optimized.shots ||
    current.optimized.seed !== baseline.optimized.seed
  )
    warning.push("Sampling settings differ between versions.");
  if (
    current.backend !== baseline.backend ||
    current.device !== baseline.device ||
    current.records[1].program.experiment!.producer_version !==
      baseline.records[1].program.experiment!.producer_version
  )
    warning.push("SDK or execution backend differs between versions.");
  const delta = current.optimized.expected - baseline.optimized.expected;
  return {
    label:
      Math.abs(delta) < 1e-5
        ? "No clear change in expected cut"
        : delta > 0
          ? "Higher expected cut"
          : "Lower expected cut",
    delta,
    warning,
  };
}

// Compact only the generated request; retain all preceding user-authored text.
// Raw native messages and the copy action remain unchanged for traceability.
export function iterationQuestion(text: string) {
  const title = "Iterate the saved QAOA Max-Cut experiment";
  const index = text.indexOf(title);
  if (index < 0) return null;
  try {
    const ref = iterationFromSource(text.slice(index));
    if (!ref) return null;
    return {
      summary:
        text.slice(0, index) +
        `Iterate QAOA with p=${ref.layers}, ${ref.shots.toLocaleString("en-US")} shots and seed ${ref.seed}.\n\nCompare with the saved optimized result, preserving the baseline and current drafts.`,
      details: text.slice(index),
      reference: ref,
    };
  } catch {
    return null;
  }
}
