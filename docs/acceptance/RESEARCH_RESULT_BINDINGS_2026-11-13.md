# Bound research results — 2026-11-13

Saved Max-Cut experiment projections now retain objective values, units, gate and
execution parameters, and resources bound to the frozen Python source, run,
program and FQX archive hashes. The first adapter accepts a single bounded,
literal EDGES graph; it never executes source to identify a problem.

Existing experiment reads deterministically backfill or remove derived reports.
Research packages carry the reports in their run records. Independent import
loads the actual FQX and reconstructs the projection using the frozen source;
re-export preserves canonical identities. Reproduction comparison includes
problem identity, metric values/methods/units and recorded gate parameters.

The adapter separates exact probabilities from sampled observations. A report
preserves failed execution status; it does not certify that the circuit solves
the declared objective, prove statistical significance or claim quantum advantage.
Unsupported, ambiguous, truncated, nonfinite or mismatched inputs produce no
inferred metric report. Original archives and source files remain unchanged.

Validation used the installed FlagQuantum 0.4.0 / PyTorch 2.13.0 CPU SDK:

- Full SDK acceptance: 125 tests, zero skipped tests, failures or errors.
- Six focused result tests include a real two-qubit QAOA calculation, persistence
  reopening, legacy backfill, export, independent import and re-export.
- The real calculation's objective is checked against its saved probabilities;
  imported and local projections compare equally without another submission.
- Negative cases cover source/run/archive mismatches, ambiguous graph selection,
  nonfinite values, qubit ordering, counts/shot mismatch and failed executions.

Command: `python packages/quantum-workspace/tests/sdk_acceptance.py --report /tmp/research-result-acceptance.json`
using the installed SDK interpreter. The existing required SDK CI lane discovers
these tests and rejects skipped tests. No paid model calls, user service restarts,
UI changes or edits to original drafts/research outputs were performed.
