# Original synthesis notebook execution

This acceptance runs the 212 original FlagQuantum synthesis notebooks through
the real local Web notebook service. Each notebook gets a new database,
workspace and IPython kernel. Two independent notebooks may run concurrently;
the original cells, numerical parameters and optimization iterations are kept.
No model calls are made.

## Final result

**212/212 notebooks and all 2,495 original code cells completed.** The final
environment has 213 immutable attempts: 212 completed and one retained initial
graph-coloring interruption. No original notebook cells were edited, skipped or
replaced with cached outputs. No output cells reached the truncation limit.
Every execution receipt, independent environment fingerprint and recorded
artifact checksum was checked before exporting the summary.

| Category | Completed notebooks |
| --- | ---: |
| Algorithms | 45 |
| Applications | 69 |
| Community | 18 |
| Functions | 31 |
| Tutorials | 49 |
| Total | 212 |

The machine-readable final report is
[`notebook-corpus-native-2026-11-24.json`](notebook-corpus-native-2026-11-24.json).
Minimum graph coloring completed its unchanged rerun in 1,922.58 seconds
(about 32 minutes). Other long examples include Maxwell 2D (1,597.349 seconds),
maximum induced k-color subgraph (1,438.627 seconds) and glued trees
(838.285 seconds). These are observed local elapsed times, not promises for
other machines.

## Inputs and runtime

The source tree is pinned to FlagQuantum commit
`0c88d5af9cd1f9dd0d39dca8d54309199c81c086`. The notebook catalog retains its
original notebook provenance at
`fb7c05184085f829f282780618014001a3da1714`; its notebook bytes match that source
tree. The final execution uses a complete editable installation from the first
commit, including the native CPU and sparse Blossom extensions. Module and
distribution versions both report `0.4.0`. Exact code and native artifact hashes
are recorded in the machine-readable report.

The environment reuses existing local scientific dependencies. It is not an
independent clean-environment installation. Added dependencies include PySCF
2.15.0 and scikit-learn 1.9.1. A failed PySCF 2.15.1 source installation was
retained in the local preparation history; the successful installation uses a
published binary wheel.

The first pass of the final audit assigns each kernel four CPU threads, a 1,800-second cell
deadline, a 7,200-second notebook deadline and a 4 GiB notebook memory budget.
Elapsed times include contention from the second independent kernel and are
not isolated performance benchmarks. The default interactive profile remains
two threads and a 600-second cell deadline; long examples need the recorded
profile rather than an implicit unlimited execution budget.

Minimum graph coloring exceeded the initial cell deadline. Its successful retry
profile uses the same original cells and four CPU threads, with a 7,200-second
cell deadline and a 14,400-second notebook deadline. The initial interruption
remains in the ledger; the larger budget does not reduce optimization iterations.

The current local Web is activated on that complete SDK installation with four
threads and a 7,200-second cell deadline in its local settings. This interactive
profile is distinct from the shorter final audit deadline; changing that local
profile does not change the receipts of already running audit kernels.

## Missing inputs repaired

The original notebook and Python source bytes are unchanged. Execution supplies
the following missing inputs:

- The credit-card example's published 948-row data subset, with ULB/Worldline
  attribution and the original dataset license references.
- The QGAN example's two original pretrained weight files from a pinned Classiq
  library revision, with its MIT license notice.
- The edge-detection example's original PNG, previously omitted from its bundle.
- The original parent Hamiltonian JSON files used by exponentiation and
  Hamiltonian evolution examples.

The three downloaded inputs have pinned URLs, sizes and SHA-256 hashes in
`apps/web/public/examples/synthesis-inputs/manifest.json`. The other inputs are
original files from the existing source snapshot. Inputs are checked before
staging and existing user files are never overwritten. Arbitrary imported
notebooks do not implicitly receive these source-bound inputs.

## Records and interpretation

The final raw audit is retained locally under
`.flagqai/acceptance/notebook-native-corpus-2026-11-24/`. Each immutable attempt
contains the original-cell execution receipt, an executed notebook, its own
database, companion files and generated artifacts. The exported report checks
every original code cell against its receipt and requires every cell to finish;
an overall status alone is insufficient. Output and artifact hashes permit
subsequent inspection without committing installed dependencies or databases.

Earlier attempts remain under
`.flagqai/acceptance/notebook-corpus-2026-11-24/`. The first pass completed 195
notebooks; input repairs and longer deadlines brought that environment to 200.
Those records include missing-input errors, timeouts and interruptions. The old
environment lacked a native extension and had mismatched SDK distribution
metadata, so its successes are not combined with the final environment to claim
full coverage. All 212 notebooks are rerun in the final environment.
The shareable historical summary is
[`notebook-corpus-history-2026-11-24.json`](notebook-corpus-history-2026-11-24.json).

Successful execution means the original code and its assertions completed.
It does not imply optimizer convergence, quantum advantage or scientific
correctness beyond the checks the original examples actually perform.

Supporting regressions passed: 252 backend tests with the complete SDK, 336
frontend tests, all 96 Chromium scenarios with the same SDK, TypeScript, the Web
production build and staged CLI package verification (2,671 files, 32 entry
targets). The browser scenarios include real credit-card data execution and
unrelated draft preservation. The release inventory recognizes only the exact
Git identities of the original PNG and two attributed pretrained weight files;
CLI package binary checks remain unchanged. The CI SDK source pin is aligned
with the example snapshot and its scientific dependencies are explicitly pinned.
Browser acceptance also covers the complete QAOA export/import/reproduction
workflow, rapid follow-up insertion and editing, and horizontal containment of
the project Quick Open dialog. Runtime comparison checks use the archived run's
actual Torch version and SDK code hash; the separate CI SDK lane retains its
explicit Torch version pin.

## Repeating the audit

Use a compatible installed FlagQuantum build and the recorded scientific
dependencies, then run from the repository root:

```sh
python packages/quantum-workspace/tests/notebook_parallel_acceptance.py \
  --report-root .flagqai/acceptance/notebook-corpus-new \
  --workers 2 --cpu-threads 4 --cell-timeout 1800 --notebook-timeout 7200
python packages/quantum-workspace/tests/export_notebook_acceptance.py \
  .flagqai/acceptance/notebook-corpus-new
```

Resume the first command with the same report root to retain successful
attempts and create new attempt directories for failures. Runtime or original
notebook changes require a new report root. `--only` can select a notebook ID
or path fragment for a focused rerun. No failed attempt is overwritten.
