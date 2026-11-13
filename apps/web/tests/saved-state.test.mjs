import test from "node:test";
import assert from "node:assert/strict";
import { previewStateDistribution } from "../src/state/saved-state.ts";

test("complete saved amplitudes yield probabilities with q0 first and no fabricated counts", () => {
  const distribution = previewStateDistribution(
    {
      truncated: false,
      shape: [1, 4],
      complex: true,
      values: [
        [0, 0],
        [0, 0],
        [0, 1],
        [0, 0],
      ],
    },
    2,
  );
  assert.deepEqual(distribution.entries, [{ state: "10", probability: 1 }]);
  assert.equal(distribution.total_probability, 1);
  assert.equal(distribution.support_size, 1);
});
test("a truncated amplitude prefix never becomes a complete probability result", () => {
  assert.equal(
    previewStateDistribution(
      {
        truncated: true,
        shape: [1, 65536],
        values: Array(1024).fill([0, 0]),
        complex: true,
      },
      16,
    ),
    null,
  );
  assert.equal(
    previewStateDistribution(
      { truncated: false, shape: [2, 4], values: Array(8).fill(0) },
      2,
    ),
    null,
  );
  assert.equal(
    previewStateDistribution(
      { truncated: false, shape: [2], values: [Infinity, 0] },
      1,
    ),
    null,
  );
});
test("non-unit norm and omitted probability are retained rather than normalized away", () => {
  const distribution = previewStateDistribution(
    {
      truncated: false,
      shape: [512],
      values: Array(512).fill(0.1),
      complex: false,
    },
    9,
  );
  assert.equal(distribution.entries.length, 256);
  assert.equal(distribution.support_size, 512);
  assert(Math.abs(distribution.total_probability - 5.12) < 1e-12);
  assert(Math.abs(distribution.omitted_probability - 2.56) < 1e-12);
});

test("malformed shapes, invalid qubits and finite amplitudes that overflow are unavailable", () => {
  const state = { truncated: false, shape: [4], values: [0, 1, 0, 0] };
  for (const qubits of [NaN, Infinity, -1, 0, 1.5, 21])
    assert.equal(previewStateDistribution(state, qubits), null);
  for (const shape of [[], [2, 2], [0, 4], [-1, -4], [1.5, 4 / 1.5], "4"])
    assert.equal(previewStateDistribution({ ...state, shape }, 2), null);
  assert.equal(
    previewStateDistribution({ ...state, values: [1e308, 0, 0, 0] }, 2),
    null,
  );
  const zero = previewStateDistribution({ ...state, values: [0, 0, 0, 0] }, 2);
  assert.deepEqual(zero.entries, []);
  assert.equal(zero.total_probability, 0);
});
