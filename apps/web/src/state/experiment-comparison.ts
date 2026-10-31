import type {
  Instruction,
  QuantumJob,
  SavedMeasurement,
} from "../contracts/quantum-workspace";

export function comparisonMeasurements(job: QuantumJob) {
  return (job.experiment?.measurements || []).flatMap((measurement, index) =>
    (measurement.batches || []).map((rows, batch) => ({
      measurement,
      index,
      batch,
      rows,
    })),
  );
}
export function measurementCompatibility(
  a?: SavedMeasurement,
  b?: SavedMeasurement,
) {
  if (!a || !b) return "Choose a saved counts measurement on each side.";
  if (
    a.kind !== b.kind ||
    JSON.stringify(a.qubits) !== JSON.stringify(b.qubits)
  )
    return "Measurement type or recorded qubit order differs. Distributions are shown independently.";
  return null;
}
export function compareDistributions(
  a: { state: string; key_type: string; count: number }[],
  b: { state: string; key_type: string; count: number }[],
) {
  const totalA = a.reduce((sum, row) => sum + row.count, 0),
    totalB = b.reduce((sum, row) => sum + row.count, 0);
  if (!totalA || !totalB) return null;
  const map = new Map<
    string,
    { state: string; keyType: string; a: number; b: number }
  >();
  for (const [side, rows] of [
    ["a", a],
    ["b", b],
  ] as const)
    for (const row of rows) {
      const key = JSON.stringify([row.key_type, row.state]);
      const item = map.get(key) || {
        state: row.state,
        keyType: row.key_type,
        a: 0,
        b: 0,
      };
      item[side] += row.count;
      map.set(key, item);
    }
  const rows = [...map.values()].map((row) => ({
    ...row,
    pa: row.a / totalA,
    pb: row.b / totalB,
    delta: row.b / totalB - row.a / totalA,
  }));
  rows.sort(
    (a, b) =>
      Math.abs(b.delta) - Math.abs(a.delta) || a.state.localeCompare(b.state),
  );
  return {
    rows,
    totalA,
    totalB,
    distance: rows.reduce((sum, row) => sum + Math.abs(row.delta), 0) / 2,
  };
}
const gateKey = (gate: Instruction) =>
  JSON.stringify([
    gate.name.toLowerCase(),
    gate.wires,
    Object.entries(gate.params || {}).sort(),
  ]);
export function circuitDifference(a: Instruction[], b: Instruction[]) {
  if (a.length > 200 || b.length > 200)
    return {
      added: new Set<number>(),
      removed: new Set<number>(),
      limited: true,
    };
  const matrix = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  const ka = a.map(gateKey),
    kb = b.map(gateKey);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      matrix[i][j] =
        ka[i] === kb[j]
          ? 1 + matrix[i + 1][j + 1]
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  const added = new Set<number>(),
    removed = new Set<number>();
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ka[i] === kb[j]) {
      i++;
      j++;
    } else if (
      j < b.length &&
      (i === a.length || matrix[i][j + 1] >= matrix[i + 1][j])
    )
      added.add(j++);
    else removed.add(i++);
  }
  return { added, removed, limited: false };
}

// Collection responses can arrive in filesystem/worker order. Keep run order,
// then use natural filename order within each run so named A/B pairs are stable.
export function comparisonCandidates(
  runs: {
    experiments?: { id: string; filename: string; has_result: boolean }[];
  }[],
) {
  return [
    ...new Set(
      runs.flatMap((run) =>
        [...(run.experiments || [])]
          .filter((item) => item.has_result)
          .sort((a, b) =>
            a.filename.localeCompare(b.filename, "en", { numeric: true }),
          )
          .map((item) => item.id),
      ),
    ),
  ];
}
