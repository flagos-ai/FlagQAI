// Isolated task input, not a production model/template or a reasoning agent.
import { qaoaSource } from "../src/tasks/qaoa-maxcut.mjs";
export const fiveCyclePrompt = `Solve Max-Cut on the five-node cycle [(0,1),(1,2),(2,3),(3,4),(4,0)] with FlagQuantum QAOA. Enumerate all 32 cuts, compare the uniform baseline with a bounded p=1 grid search, save baseline/optimized/replay .fqx files, and show the real results. Preserve my current unsaved draft and failed attempts. Use CPU/PyTorch, 4096 shots and seed 42; do not claim quantum advantage.`;
export const fiveCycleSource =
  "# FIVE_CYCLE_USER_ACCEPTANCE\n" +
  qaoaSource
    .replace(
      /^EDGES = .*$/m,
      "EDGES = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 0)]",
    )
    .replace(
      "N, SHOTS, SEED, GRID = 6, 4096, 42, 9",
      "N, SHOTS, SEED, GRID = 5, 4096, 42, 9",
    );
