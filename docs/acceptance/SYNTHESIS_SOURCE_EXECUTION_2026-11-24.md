# Synthesis source execution acceptance

The source tree is pinned to FlagQuantum revision
`0c88d5af9cd1f9dd0d39dca8d54309199c81c086`. Opening a file is separate from
running it. Original sources are not rewritten to insert environment guards,
imports, plots or result-saving code.

## Execution behavior

Explicit Python Run carries the selected editor draft and a checksum-verified
snapshot of the original companion tree, including JSON, CSV and other data.
The worker stages that snapshot in a temporary directory, resolves both package
and sibling imports, and executes the selected module with ordinary script
arguments. This fixes relative-import/data failures and the extra argument that
previously broke argparse entrypoints such as cooling-system optimization.

The recorded input snapshot is immutable. Evidence exports include the entry,
companion Python sources, base64 data assets, upstream revision, original file
hash and complete input snapshot hash. Changed library assets refuse submission;
changed saved snapshots refuse execution/export. Ordinary single-file and project
execution remain supported. Python Run accepts up to 64 KiB, covering the pinned
52,292-byte largest source; existing project/import limits remain separate.

An unavailable local interpreter produces an environment-recovery instruction
instead of a raw missing-file error or an implicit interpreter fallback. The
local machine was switched from the deleted temporary interpreter to a dedicated
workspace environment. That environment uses a compatible source SDK checkout
and existing scientific dependencies; this is not a clean independent SDK install
or a transferable environment specification.

## Verified coverage

- All 2,679 assets match their pinned size and SHA256; all 1,318 original Python
  files parse with the selected Python 3.12 interpreter.
- Import/API requirements are collected across all 432 `main.py` closures and
  probed against the actual interpreter. After installing PySCF 2.15.0 and
  scikit-learn 1.9.1, no missing imports or SDK symbols were found. This is an
  environment check, not a
  claim that all 432 research workflows completed.
- Eight unmodified entrypoints complete real worker execution: superposition, HHL,
  Swap test, cooling-system optimization, QAOA (MaxCut and knapsack), and the
  molecular eigensolver, QSVM and LiH chemistry. The large `hhl_lanchester/physics.py` helper also executes
  successfully, but is not counted as an additional scientific workflow.
- Cooling produces its actual classical/QSVT temperatures and relative thermal
  error (approximately 0.02396). QAOA prints `converged False` for its bounded
  optimizer runs; execution success is not convergence evidence.
- A real process regression covers relative/absolute imports, packaged JSON,
  argparse, edited drafts above 32 KiB, frozen companion versions, altered input
  refusal and actionable missing-interpreter handling.
- Final frontend checks: 336 tests, TypeScript and production build pass.
- Python-run and bridge regressions: 36 tests pass, including real FQX collection.
- Nine isolated browser scenarios pass, including Run on the original cooling
  source, evidence export, complete Notebook companion imports, drafts, cell
  editing, completion, output and file switching.
- Staged CLI package verification passes (2,671 files, 32 entry targets). CLI
  distribution sources were not changed. No paid model calls were made.

## Repeatable checks

Use the compute interpreter, with compatible FlagQuantum, Torch and the optional
scientific libraries required by the selected example:

```sh
python packages/quantum-workspace/tests/synthesis_sdk_acceptance.py --environment-only
python packages/quantum-workspace/tests/synthesis_sdk_acceptance.py
python packages/quantum-workspace/tests/synthesis_sdk_acceptance.py --entry applications/automotive/cooling_systems_optimization/overview/main.py
```

`--all-entrypoints` explicitly requests an expensive fresh execution audit. It
retains the Web's 90-second task limit and records failures/timeouts as such.
Helper modules, successful imports and archived Notebook outputs are not evidence
that an entire scientific workflow completed. The 212 complete Notebook workflows
have not all been executed by this acceptance, and larger tasks can require more
resources or time than the local Web runner permits.

## Retained prerequisite failure

The credit-card fraud overview entry was also executed and correctly failed
because its separately distributed `creditcard.csv` is absent. The original
README links the pinned 948-row dataset; its required SHA256 is
`cb6baeefbfd24b7b8f865b55efa366e2023b35bb125bc88a9f08a4c03724e5cd`.
This acceptance does not replace it with synthetic data or claim workflow
completion. The raw failure and eight successful entry runs are retained in
[synthesis-source-sdk-2026-11-24.json](synthesis-source-sdk-2026-11-24.json).

The latest PySCF 2.15.1 source archive failed locally because its build expected a
missing `libxcfun.patch`. Selecting an available compatible prebuilt wheel
installed PySCF 2.15.0 successfully; the subsequent API check and LiH execution
used that real installation.
