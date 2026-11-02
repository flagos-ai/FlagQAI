// One reference definition shared by the UI and isolated protocol acceptance.
export const qaoaTaskName = "QAOA Max-Cut · 6 nodes";
export const qaoaTaskPrompt = `QAOA Max-Cut reference task
Solve Max-Cut on the six-node triangular-prism graph with edges [(0,1),(1,2),(2,0),(3,4),(4,5),(5,3),(0,3),(1,4),(2,5)].
Create a separate Python model with FlagQuantum; preserve my current code and unsaved drafts. Enumerate all 64 cuts for the classical optimum. Compare uniform superposition with p=1 QAOA, optimizing gamma in [0,pi) and beta in [0,pi/2) on a deterministic 9-by-9 grid using exact SDK probabilities. Use CPU/PyTorch, no backend fallback, 4096 shots and seed 42 for the final samples. Report expected cut, optimum-hit probability, sampled mean cut and sampled optimum-hit rate. Explain finite sampling and do not claim quantum advantage.
Save executed plans and results as 01-maxcut-baseline.fqx and 02-maxcut-qaoa.fqx. Load the optimized archive, rerun its program with the same runtime/settings, assert matching counts and probabilities, and save 03-maxcut-replay.fqx. Run real SDK code, never fabricate output. Show the optimized circuit, open baseline-versus-optimized comparison, and make the replay comparison available. Explain the files, parameters and source snapshot needed to reproduce the result. Keep failures visible and stop if checks fail.
SDK API notes: probability-only runs omit shots; counts are returned as a list of batch dictionaries (use result.counts[0] for one batch). Save result.plan. Loaded archive programs already retain measurement requests, so rerun them without adding outputs again.`;

export const qaoaSource = `from dataclasses import replace
import itertools
import json
import math

import flagquantum as fq

# A frustrated optimization problem, not a quantum advantage demonstration.
EDGES = [(0, 1), (1, 2), (2, 0), (3, 4), (4, 5), (5, 3), (0, 3), (1, 4), (2, 5)]
N, SHOTS, SEED, GRID = 6, 4096, 42, 9
OPTIONS = fq.ExecutionOptions(
    device="cpu", backend="pytorch", allow_backend_fallback=False,
    shots=SHOTS, seed=SEED,
)
SEARCH_OPTIONS = replace(OPTIONS, shots=None)


def cut(bits):
    return sum(bits[u] != bits[v] for u, v in EDGES)


STATES = ["".join(bits) for bits in itertools.product("01", repeat=N)]
COSTS = [cut(bits) for bits in STATES]
OPTIMUM = max(COSTS)
OPTIMAL_STATES = [bits for bits in STATES if cut(bits) == OPTIMUM]


def circuit(gamma=None, beta=None):
    program = fq.Circuit(N)
    for q in range(N):
        program.h(q)
    if gamma is not None:
        # C = sum((1-Z_u*Z_v)/2). RZZ(-gamma) implements exp(-i*gamma*C)
        # up to global phase; RX(2*beta) implements the X mixer.
        for u, v in EDGES:
            program.cx(u, v)
            program.rz(v, -gamma)
            program.cx(u, v)
        for q in range(N):
            program.rx(q, 2 * beta)
    return program


def probabilities(result):
    # Default all-qubit SDK outputs use q0-first binary basis indexing.
    return result.probabilities.reshape(-1).tolist()


def expectation(values):
    return sum(p * value for p, value in zip(values, COSTS))


def metrics(result):
    values = probabilities(result)
    assert len(result.counts) == 1, "Expected one unbatched measurement"
    counts = result.counts[0]
    shots = sum(counts.values())
    return {
        "expected_cut": expectation(values),
        "approximation_ratio": expectation(values) / OPTIMUM,
        "optimum_probability": sum(p for bits, p in zip(STATES, values) if cut(bits) == OPTIMUM),
        "sampled_mean_cut": sum(cut(bits) * count for bits, count in counts.items()) / shots,
        "sampled_optimum_rate": sum(count for bits, count in counts.items() if cut(bits) == OPTIMUM) / shots,
        "recorded_shots": shots,
    }


best = None
for g, b in itertools.product(range(GRID), repeat=2):
    gamma, beta = math.pi * g / GRID, math.pi * b / (2 * GRID)
    search = fq.run(circuit(gamma, beta), outputs=fq.probabilities(), options=SEARCH_OPTIONS)
    score = expectation(probabilities(search))
    if best is None or score > best[0]:
        best = (score, gamma, beta)

baseline = fq.run(circuit(), outputs=(fq.counts(), fq.probabilities()), options=OPTIONS)
optimized = fq.run(circuit(best[1], best[2]), outputs=(fq.counts(), fq.probabilities()), options=OPTIONS)
a, b = metrics(baseline), metrics(optimized)
assert abs(a["expected_cut"] - len(EDGES) / 2) < 1e-5
assert b["expected_cut"] > a["expected_cut"] + 0.15
assert b["optimum_probability"] > a["optimum_probability"]
assert a["recorded_shots"] == b["recorded_shots"] == SHOTS
fq.save("01-maxcut-baseline.fqx", baseline.plan, result=baseline)
fq.save("02-maxcut-qaoa.fqx", optimized.plan, result=optimized)

# Loading reads evidence; the subsequent run performs new computation.
archive = fq.load("02-maxcut-qaoa.fqx")
assert archive.result.counts == optimized.counts
# The archive already retains its measurement requests; do not add them twice.
replay = fq.run(archive.program, options=OPTIONS)
assert replay.counts == optimized.counts, "Seeded replay counts differ in this runtime"
assert max(abs(x-y) for x, y in zip(probabilities(replay), probabilities(optimized))) < 1e-6
fq.save("03-maxcut-replay.fqx", replay.plan, result=replay)
print("MAXCUT_REPORT=" + json.dumps({
    "schema": "flagqai.maxcut-reference.v1", "nodes": N, "edges": EDGES,
    "classical_optimum": OPTIMUM, "optimal_states": OPTIMAL_STATES,
    "depth_p": 1, "grid_evaluations": GRID ** 2,
    "gamma": best[1], "beta": best[2], "shots": SHOTS, "seed": SEED,
    "baseline": a, "optimized": b, "replay_matches": True,
    "limitations": "Ideal CPU simulation; finite samples; no quantum advantage claim. Seeded replay is checked for this SDK/runtime.",
}, sort_keys=True))
`;
