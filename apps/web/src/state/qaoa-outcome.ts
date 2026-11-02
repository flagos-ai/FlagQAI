import type { PythonRun } from "../api/python-runs";
import type {
  ExperimentImport,
  SavedMeasurement,
} from "../contracts/quantum-workspace";

export const qaoaFiles = [
  "01-maxcut-baseline.fqx",
  "02-maxcut-qaoa.fqx",
  "03-maxcut-replay.fqx",
];

// Only literal graph data is supported. Never execute or evaluate Python source.
export function graphFromSource(source: string) {
  const invalid = () =>
    Error(
      "Use one literal Max-Cut graph with 2–12 vertices, distinct integer vertex pairs and optional finite positive weights.",
    );
  const assignments = [
    ...source.matchAll(/^EDGES[ \t]*(?::[^=\r\n]+)?[ \t]*=/gm),
  ];
  if (assignments.length !== 1) throw invalid();
  let cursor = assignments[0].index! + assignments[0][0].length;
  while (/\s/.test(source[cursor] || "") && cursor < source.length) cursor++;
  if (!"[(".includes(source[cursor] || " ")) throw invalid();
  const closing: Record<string, string> = { "[": "]", "(": ")" };
  const stack: string[] = [];
  let literal = "";
  for (; cursor < source.length; cursor++) {
    const char = source[cursor];
    // Numeric literals contain no strings: comments can be skipped without
    // interpreting Python or letting brackets inside comments end the graph.
    if (char === "#") {
      while (cursor < source.length && source[cursor] !== "\n") cursor++;
      literal += "\n";
      continue;
    }
    if (char === "[" || char === "(") stack.push(closing[char]);
    else if (char === "]" || char === ")") {
      if (stack.pop() !== char) throw invalid();
    }
    literal += char;
    if (!stack.length) {
      cursor++;
      break;
    }
  }
  if (
    stack.length ||
    !/^[ \t\r]*(?:#.*)?$/.test(source.slice(cursor).split("\n")[0])
  )
    throw invalid();
  const body = literal.slice(1, -1);
  const rows = [
    ...body.matchAll(
      /[\[(]\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?))?\s*[\])]/g,
    ),
  ];
  let end = 0;
  const edges = rows.map((row, i) => {
    if (
      !(i ? /^\s*,\s*$/ : /^\s*$/).test(body.slice(end, row.index)) ||
      ({ "[": "]", "(": ")" } as Record<string, string>)[row[0][0]] !==
        row[0].at(-1)
    )
      throw invalid();
    end = row.index! + row[0].length;
    return [
      Number(row[1]),
      Number(row[2]),
      row[3] === undefined ? 1 : Number(row[3]),
    ];
  });
  if (
    !/^\s*,?\s*$/.test(body.slice(end)) ||
    !edges.length ||
    edges.some(
      ([u, v, w]) =>
        !Number.isSafeInteger(u) ||
        !Number.isSafeInteger(v) ||
        u === v ||
        !Number.isFinite(w) ||
        w <= 0,
    ) ||
    !Number.isFinite(edges.reduce((sum, e) => sum + e[2], 0)) ||
    new Set(edges.map(([u, v]) => [Math.min(u, v), Math.max(u, v)].join(",")))
      .size !== edges.length
  )
    throw invalid();
  const n = Math.max(...edges.flatMap(([u, v]) => [u, v])) + 1;
  if (n < 2 || n > 12) throw invalid();
  return { n, edges, weighted: edges.some((e) => e[2] !== 1) };
}
function measurement(record: ExperimentImport, kind: string, n: number) {
  const matches = record.program.experiment!.measurements.filter(
    (m) => m.kind === kind,
  );
  const m = matches[0];
  if (
    matches.length !== 1 ||
    !m ||
    JSON.stringify(m.qubits) !==
      JSON.stringify(Array.from({ length: n }, (_, i) => i))
  )
    throw Error("Saved measurement type or qubit order is not supported.");
  return m;
}
function probabilities(m: SavedMeasurement, size: number) {
  const value = m.value as
    | {
        values?: number[];
        shape?: number[];
        truncated?: boolean;
        complex?: boolean;
      }
    | undefined;
  const values = value?.values;
  if (
    !values ||
    values.length !== size ||
    value?.truncated ||
    value?.complex ||
    JSON.stringify(value.shape) !== JSON.stringify([1, size]) ||
    values.some((p) => !Number.isFinite(p) || p < 0) ||
    Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-5
  )
    throw Error("Saved probabilities are incomplete or invalid.");
  return values;
}
function counts(m: SavedMeasurement, n: number) {
  if (m.batches?.length !== 1)
    throw Error("A single saved counts batch is required.");
  const values = Array(2 ** n).fill(0) as number[];
  for (const row of m.batches[0]) {
    if (
      row.key_type !== "string" ||
      !new RegExp(`^[01]{${n}}$`).test(row.state) ||
      !Number.isSafeInteger(row.count) ||
      row.count < 0
    )
      throw Error("Saved counts are invalid.");
    values[parseInt(row.state, 2)] += row.count;
  }
  if (!m.shots || values.reduce((a, b) => a + b, 0) !== m.shots)
    throw Error("Saved counts do not match recorded shots.");
  return values;
}
export async function qaoaOutcome(run: PythonRun, records: ExperimentImport[]) {
  if (
    run.status !== "completed" ||
    run.collection_status !== "completed" ||
    run.collection_errors?.length
  )
    throw Error("Run collection is not complete.");
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(run.source),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== run.source_hash)
    throw Error("Saved code does not match its recorded version.");
  const ordered = qaoaFiles.map((filename) => {
    const refs = run.experiments?.filter((e) => e.filename === filename);
    if (refs?.length !== 1)
      throw Error("Expected one archive for each QAOA stage.");
    const ref = refs[0],
      record = records.find((r) => r.id === ref.id),
      info = record?.program.experiment,
      origin = record?.program.origin;
    if (
      !record ||
      !info ||
      !ref.has_result ||
      !info.has_result ||
      info.id !== ref.id ||
      info.filename !== filename ||
      !/^[a-f0-9]{64}$/.test(ref.sha256) ||
      info.sha256 !== ref.sha256 ||
      info.python_run?.id !== run.id ||
      info.python_run.source_hash !== digest ||
      origin?.run_id !== run.id ||
      origin.source_hash !== digest ||
      origin.source !== run.source
    )
      throw Error(
        "Archive provenance does not match this run and code version.",
      );
    return record;
  });
  const { n, edges, weighted } = graphFromSource(run.source);
  if (ordered.some((r) => r.program.compiled.qubits !== n))
    throw Error("Graph and saved circuit sizes differ.");
  const costs = Array.from({ length: 2 ** n }, (_, i) => {
    const bits = i.toString(2).padStart(n, "0");
    return edges.reduce(
      (sum, [u, v, w]) => sum + w * Number(bits[u] !== bits[v]),
      0,
    );
  });
  const optimum = Math.max(...costs);
  const data = ordered.map((record) => {
    const p = probabilities(measurement(record, "probabilities", n), 2 ** n),
      m = measurement(record, "counts", n),
      c = counts(m, n);
    return {
      p,
      c,
      shots: m.shots!,
      seed: m.metadata.seed,
      expected: p.reduce((sum, v, i) => sum + v * costs[i], 0),
      hit:
        c.reduce((sum, v, i) => sum + (costs[i] === optimum ? v : 0), 0) /
        m.shots!,
    };
  });
  const [baseline, optimized, replay] = data;
  const probabilityDelta = Math.max(
    ...optimized.p.map((v, i) => Math.abs(v - replay.p[i])),
  );
  const sameSeed =
    typeof optimized.seed === "number" &&
    Number.isSafeInteger(optimized.seed) &&
    optimized.seed === replay.seed;
  const sameProgram =
    !!ordered[1].program.experiment!.program_hash &&
    ordered[1].program.experiment!.program_hash ===
      ordered[2].program.experiment!.program_hash;
  const fingerprints = ordered
    .slice(1)
    .map(
      (r) =>
        r.program.experiment!.execution_plan?.fingerprints as
          | Record<string, unknown>
          | undefined,
    );
  const sameEnvironment = ["environment", "options", "compiler"].every(
    (key) =>
      typeof fingerprints[0]?.[key] === "string" &&
      fingerprints[0][key] === fingerprints[1]?.[key],
  );
  const replayMatches =
    sameSeed &&
    sameProgram &&
    sameEnvironment &&
    optimized.shots === replay.shots &&
    optimized.c.every((v, i) => v === replay.c[i]) &&
    probabilityDelta < 1e-6;
  const plan = ordered[1].program.experiment!.execution_plan;
  const decision = plan?.decision as Record<string, unknown> | undefined;
  const runtime = ordered[1].program.experiment!.runtime as
    | Record<string, unknown>
    | undefined;
  return {
    baseline,
    optimized,
    replayMatches,
    probabilityDelta,
    n,
    edges: edges.length,
    weighted,
    graph: JSON.stringify(
      edges
        .map(([u, v, w]) => [Math.min(u, v), Math.max(u, v), w])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    ),
    optimum,
    records: ordered,
    sourceHash: digest,
    backend: String(
      decision?.backend || runtime?.simulation_engine || "Unrecorded backend",
    ),
    device: String(runtime?.device || decision?.device || "Unrecorded device"),
  };
}
