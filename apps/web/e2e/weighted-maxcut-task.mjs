// Deterministic acceptance input; execution uses the actual installed SDK.
import { qaoaSource } from "../src/tasks/qaoa-maxcut.mjs";
export const weightedMaxcutName = "weighted five-node Max-Cut";
export const weightedMaxcutPrompt = `Solve weighted five-node Max-Cut with edges [(0,1,0.5),(1,2,1.5),(2,3,2),(3,4,0.75),(4,0,1.25),(0,2,1)]. Use FlagQuantum QAOA, enumerate all 32 cuts, compare uniform baseline with a bounded p=1 grid search and report weighted expected cut and sampled optimum rate. Save baseline/optimized/replay .fqx files, preserve my unsaved draft and failures, and show the actual results. Use CPU/PyTorch, 4096 shots and seed 42. No quantum advantage claim.`;
export const weightedMaxcutSource =
  "# WEIGHTED_MAXCUT_USER_ACCEPTANCE\n" +
  qaoaSource
    .replace(
      /^EDGES = .*$/m,
      "EDGES = [\n    (0, 1, 0.5), # A comment may contain ]\n    (1, 2, 1.5),\n    (2, 3, 2),\n    (3, 4, 0.75),\n    (4, 0, 1.25),\n    (0, 2, 1),\n]",
    )
    .replace(
      "N, SHOTS, SEED, GRID = 6, 4096, 42, 9",
      "N, SHOTS, SEED, GRID = 5, 4096, 42, 9",
    )
    .replace(
      "sum(bits[u] != bits[v] for u, v in EDGES)",
      "sum(weight * (bits[u] != bits[v]) for u, v, weight in EDGES)",
    )
    .replace("for u, v in EDGES:", "for u, v, weight in EDGES:")
    .replace("program.rz(v, -gamma)", "program.rz(v, -gamma * weight)")
    .replace("len(EDGES) / 2", "sum(weight for _, _, weight in EDGES) / 2")
    .replace(
      "# C = sum((1-Z_u*Z_v)/2). RZZ(-gamma) implements exp(-i*gamma*C)",
      "# C = sum(w*(1-Z_u*Z_v)/2). RZZ(-gamma*w) implements exp(-i*gamma*C)",
    );
