export type StateDistribution = {
  kind: "statevector";
  qubits: number;
  total_probability: number;
  support_size: number;
  threshold: number;
  omitted_probability: number;
  entries: { state: string; probability: number }[];
};

// Only complete single-state previews can supply a local distribution. A prefix
// of a larger vector cannot establish its support, normalization or probabilities.
export function previewStateDistribution(
  state: unknown,
  qubits: number,
): StateDistribution | null {
  if (!Number.isInteger(qubits) || qubits < 1 || qubits > 20) return null;
  if (!state || typeof state !== "object") return null;
  const value = state as {
    truncated?: boolean;
    shape?: number[];
    values?: unknown[];
    complex?: boolean;
  };
  const size = 2 ** qubits;
  if (
    value.truncated !== false ||
    !Array.isArray(value.values) ||
    value.values.length !== size ||
    !Array.isArray(value.shape) ||
    value.shape.length === 0 ||
    value.shape.at(-1) !== size ||
    value.shape.some((n) => !Number.isInteger(n) || n < 1) ||
    value.shape.reduce((a, b) => a * b, 1) !== size
  )
    return null;
  const entries: StateDistribution["entries"] = [];
  let total = 0;
  for (const [index, amplitude] of value.values.entries()) {
    const parts = value.complex ? amplitude : [amplitude, 0];
    if (
      !Array.isArray(parts) ||
      parts.length !== 2 ||
      parts.some((v) => typeof v !== "number" || !Number.isFinite(v))
    )
      return null;
    const probability = parts[0] ** 2 + parts[1] ** 2;
    total += probability;
    if (!Number.isFinite(total)) return null;
    if (probability > 1e-14)
      entries.push({
        state: index.toString(2).padStart(qubits, "0"),
        probability,
      });
  }
  entries.sort(
    (a, b) => b.probability - a.probability || a.state.localeCompare(b.state),
  );
  const visible = entries.slice(0, 256);
  return {
    kind: "statevector",
    qubits,
    total_probability: total,
    support_size: entries.length,
    threshold: 1e-14,
    entries: visible,
    omitted_probability: Math.max(
      0,
      total - visible.reduce((sum, row) => sum + row.probability, 0),
    ),
  };
}
