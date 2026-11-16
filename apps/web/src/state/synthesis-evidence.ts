import type {
  ExperimentInfo,
  CompiledProgram,
  ProgramSnapshot,
} from "../contracts/quantum-workspace";

export type SynthesisEvidence = {
  iteration?: {
    role: "baseline" | "candidate";
    baseline_program_hash: string;
    method: "flagquantum.compiler.optimize";
    optimization_level: number;
    prepared_state_max_error: number;
  };
  schema: "flagqai.synthesis-evidence.v1";
  label: string;
  problem: string;
  source_sha256: string;
  program_hash: string;
  sdk_version: string;
  sdk_code_sha256: string;
  synthesis_module_sha256: string;
  constraints: Record<string, unknown>;
  report: {
    resources: {
      n_qubits: number;
      n_operations: number;
      depth: number;
      t_count: number;
      basis: string;
    };
    workspace_qubits: number;
    register_widths: Record<string, number>;
    candidate: string;
  };
  register_names: string[];
  outcomes: { values: number[]; probability: number }[];
  checks: {
    expected_outcomes: number;
    max_probability_error: number;
    tolerance: number;
    saved_circuit_replay: boolean;
  };
};
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const hash = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

// Recorded script evidence is not an independently certified verification report.
export function synthesisEvidence(
  info?: ExperimentInfo,
  sourceHash?: string,
): SynthesisEvidence | null {
  const metrics = info?.metrics;
  if (!info?.has_result || !object(metrics)) return null;
  const e = metrics.flagqai_synthesis;
  if (
    !object(e) ||
    e.schema !== "flagqai.synthesis-evidence.v1" ||
    !hash(e.source_sha256) ||
    !hash(e.program_hash) ||
    !hash(e.sdk_code_sha256) ||
    !hash(e.synthesis_module_sha256) ||
    e.program_hash !== info.program_hash ||
    (info.producer_version && e.sdk_version !== info.producer_version) ||
    (info.python_run &&
      (info.python_run.execution_status !== "completed" ||
        e.source_sha256 !== info.python_run.source_hash)) ||
    (info.python_run?.sdk_code_sha256 &&
      e.sdk_code_sha256 !== info.python_run.sdk_code_sha256) ||
    (sourceHash && e.source_sha256 !== sourceHash) ||
    ![e.label, e.problem, e.sdk_version].every(
      (v) => typeof v === "string" && v.length > 0 && v.length <= 512,
    ) ||
    !object(e.constraints) ||
    !object(e.report) ||
    !object(e.report.resources) ||
    !object(e.report.register_widths) ||
    !integer(e.report.workspace_qubits) ||
    typeof e.report.candidate !== "string" ||
    e.report.candidate.length > 512
  )
    return null;
  const r = e.report.resources;
  if (
    ![r.n_qubits, r.n_operations, r.depth, r.t_count].every(integer) ||
    typeof r.basis !== "string" ||
    !r.basis.length ||
    r.basis.length > 128 ||
    e.report.workspace_qubits > r.n_qubits
  )
    return null;
  const names = e.register_names;
  if (
    !Array.isArray(names) ||
    !names.length ||
    names.length > 16 ||
    new Set(names).size !== names.length ||
    names.some(
      (n) =>
        typeof n !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n) ||
        !integer(e.report.register_widths[n]) ||
        e.report.register_widths[n] > 32,
    )
  )
    return null;
  if (
    !Array.isArray(e.outcomes) ||
    !e.outcomes.length ||
    e.outcomes.length > 256
  )
    return null;
  let total = 0;
  const seen = new Set<string>();
  for (const row of e.outcomes) {
    if (
      !object(row) ||
      !Array.isArray(row.values) ||
      row.values.length !== names.length ||
      row.values.some(
        (v: unknown, i: number) =>
          !integer(v) || v >= 2 ** e.report.register_widths[names[i]],
      ) ||
      typeof row.probability !== "number" ||
      !Number.isFinite(row.probability) ||
      row.probability < 0 ||
      row.probability > 1
    )
      return null;
    const key = JSON.stringify(row.values);
    if (seen.has(key)) return null;
    seen.add(key);
    total += row.probability;
  }
  const c = e.checks;
  if (
    Math.abs(total - 1) > 1e-6 ||
    !object(c) ||
    c.expected_outcomes !== e.outcomes.length ||
    !Number.isFinite(c.max_probability_error) ||
    c.max_probability_error < 0 ||
    !Number.isFinite(c.tolerance) ||
    c.tolerance <= 0 ||
    c.tolerance > 1e-6 ||
    typeof c.saved_circuit_replay !== "boolean"
  )
    return null;
  const iteration = e.iteration;
  if (
    iteration !== undefined &&
    (!object(iteration) ||
      !["baseline", "candidate"].includes(iteration.role) ||
      !hash(iteration.baseline_program_hash) ||
      iteration.method !== "flagquantum.compiler.optimize" ||
      ![0, 1, 2].includes(iteration.optimization_level) ||
      !Number.isFinite(iteration.prepared_state_max_error) ||
      iteration.prepared_state_max_error < 0 ||
      (iteration.role === "baseline" &&
        iteration.baseline_program_hash !== e.program_hash))
  )
    return null;
  return e as SynthesisEvidence;
}

export function programSynthesis(program: ProgramSnapshot) {
  const evidence = synthesisEvidence(
    program.experiment,
    program.origin?.source_hash,
  );
  if (!evidence) return null;
  const r = evidence.report.resources;
  return r.n_qubits === program.compiled.qubits &&
    r.n_operations === program.compiled.instructions.length &&
    r.depth === program.compiled.depth &&
    r.t_count ===
      program.compiled.instructions.filter((gate) =>
        ["t", "tdg"].includes(gate.name.toLowerCase()),
      ).length
    ? evidence
    : null;
}

export function compareSynthesis(a: SynthesisEvidence, b: SynthesisEvidence) {
  if (
    a.problem !== b.problem ||
    JSON.stringify(a.register_names) !== JSON.stringify(b.register_names) ||
    a.register_names.some(
      (name) =>
        a.report.register_widths[name] !== b.report.register_widths[name],
    ) ||
    a.report.resources.basis !== b.report.resources.basis ||
    a.sdk_code_sha256 !== b.sdk_code_sha256 ||
    a.synthesis_module_sha256 !== b.synthesis_module_sha256 ||
    a.sdk_version !== b.sdk_version
  )
    return null;
  const values = new Map(
    a.outcomes.map((row) => [JSON.stringify(row.values), row.probability]),
  );
  let max = 0;
  if (values.size !== b.outcomes.length) return null;
  for (const row of b.outcomes) {
    const probability = values.get(JSON.stringify(row.values));
    if (probability === undefined) return null;
    max = Math.max(max, Math.abs(probability - row.probability));
  }
  return {
    max_probability_difference: max,
    operations:
      b.report.resources.n_operations - a.report.resources.n_operations,
    depth: b.report.resources.depth - a.report.resources.depth,
    qubits: b.report.resources.n_qubits - a.report.resources.n_qubits,
  };
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_name, item) =>
    object(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : item,
  );

export function synthesisIteration(a: SynthesisEvidence, b: SynthesisEvidence) {
  const compared = compareSynthesis(a, b);
  if (
    !compared ||
    a.iteration?.role !== "baseline" ||
    b.iteration?.role !== "candidate" ||
    b.iteration.baseline_program_hash !== a.program_hash ||
    a.source_sha256 !== b.source_sha256 ||
    canonical(a.constraints) !== canonical(b.constraints) ||
    a.report.resources.basis !== b.report.resources.basis ||
    a.iteration.optimization_level !== b.iteration.optimization_level
  )
    return null;
  const tolerance = Math.min(a.checks.tolerance, b.checks.tolerance);
  const passed =
    [a, b].every(
      (e) =>
        e.checks.saved_circuit_replay &&
        e.checks.max_probability_error <= e.checks.tolerance &&
        e.iteration!.prepared_state_max_error <= tolerance,
    ) && compared.max_probability_difference <= tolerance;
  const deltas = [compared.qubits, compared.operations, compared.depth];
  const verdict = !passed
    ? "Verification failed"
    : deltas.every((d) => d === 0)
      ? "No resource improvement"
      : deltas.every((d) => d <= 0)
        ? "Resources reduced"
        : deltas.every((d) => d >= 0)
          ? "Resource cost increased"
          : "Resource tradeoff";
  return { ...compared, passed, verdict };
}

export function savedOptimizationPair(programs: ProgramSnapshot[]) {
  const records = programs.flatMap((program) => {
    const evidence = programSynthesis(program);
    const run = program.experiment?.python_run;
    return evidence?.iteration && run
      ? [{ id: program.id, run: run.id, evidence }]
      : [];
  });
  for (const candidate of records) {
    if (candidate.evidence.iteration?.role !== "candidate") continue;
    const baseline = records.find(
      (item) =>
        item.run === candidate.run &&
        item.id !== candidate.id &&
        synthesisIteration(item.evidence, candidate.evidence),
    );
    if (baseline) return { left: baseline.id, right: candidate.id };
  }
  return null;
}

const operationLabels: Record<string, string> = {
  "qint.multiply": "Multiply",
  "qint.add": "Add",
  "qint.return": "Output",
  "qint.subtract_mod": "Subtract modulo",
};
// Count each executable gate once, even when fusion combines compiler sources.
export function synthesisModules(compiled: CompiledProgram) {
  const catalog = new Map(
    (compiled.synthesis_sources || []).map((s) => [s.id, s]),
  );
  if (!catalog.size) return [];
  const rows = new Map<
    string,
    { label: string; gates: number; wires: Set<number> }
  >();
  for (const gate of compiled.instructions) {
    const sources = (gate.source_ids || []).map((id) => catalog.get(id));
    const labels = [
      ...new Set(
        sources.map((s) =>
          s
            ? `${operationLabels[s.operation || ""] || s.operation || s.label}${s.action ? ` · ${s.action[0].toUpperCase()}${s.action.slice(1)}` : ""}`
            : "Unmapped",
        ),
      ),
    ].sort();
    const label = labels.length ? labels.join(" + ") : "Unmapped";
    const row = rows.get(label) || {
      label,
      gates: 0,
      wires: new Set<number>(),
    };
    row.gates++;
    gate.wires.forEach((wire) => row.wires.add(wire));
    rows.set(label, row);
  }
  return [...rows.values()].map((row) => ({
    label: row.label,
    gates: row.gates,
    wires: row.wires.size,
  }));
}
